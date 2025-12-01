#!/bin/bash

################################################################################
# AI MCP Gateway - Ubuntu Server Deployment Script
# For fresh Ubuntu Server (20.04/22.04/24.04)
################################################################################

set -e  # Exit on error

echo "=================================="
echo "AI MCP Gateway Deployment Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    print_error "Please do not run this script as root. Use a regular user with sudo privileges."
    exit 1
fi

# Check sudo access
if ! sudo -n true 2>/dev/null; then
    print_info "This script requires sudo privileges. You may be prompted for your password."
fi

# 1. Update system
print_info "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# 2. Install essential tools
print_info "Installing essential tools..."
sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban

# 3. Install Docker
print_info "Installing Docker..."
if ! command -v docker &> /dev/null; then
    # Add Docker's official GPG key
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    # Set up Docker repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker Engine
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Add current user to docker group
    sudo usermod -aG docker $USER
    print_warn "You've been added to the docker group. You may need to log out and back in for this to take effect."
else
    print_info "Docker is already installed."
fi

# 4. Install Docker Compose (standalone)
print_info "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
    sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    print_info "Docker Compose is already installed."
fi

# 5. Install Node.js (LTS version)
print_info "Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    print_info "Node.js is already installed (version: $(node -v))"
fi

# 6. Install pnpm
print_info "Installing pnpm..."
if ! command -v pnpm &> /dev/null; then
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PNPM_HOME="$HOME/.local/share/pnpm"
    export PATH="$PNPM_HOME:$PATH"
else
    print_info "pnpm is already installed."
fi

# 7. Configure firewall
print_info "Configuring firewall..."
sudo ufw --force enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 3000/tcp  # API Server
sudo ufw allow 5173/tcp  # Admin Dashboard (dev)
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
print_info "Firewall configured and enabled."

# 8. Clone repository (if not already cloned)
print_info "Setting up project directory..."
PROJECT_DIR="$HOME/ai-mcp-gateway"

if [ ! -d "$PROJECT_DIR" ]; then
    print_info "Cloning repository..."
    git clone https://github.com/babasida246/ai-mcp-gateway.git "$PROJECT_DIR"
else
    print_info "Project directory already exists. Pulling latest changes..."
    cd "$PROJECT_DIR"
    git pull origin master
fi

cd "$PROJECT_DIR"

# 9. Set up environment variables
print_info "Setting up environment variables..."
if [ ! -f .env ]; then
    cp .env.docker .env
    print_warn "Created .env file from .env.docker. Please update it with your API keys:"
    print_warn "  - OPENROUTER_API_KEY"
    print_warn "  - ANTHROPIC_API_KEY (optional)"
    print_warn "  - OPENAI_API_KEY (optional)"
    print_warn "  - POSTGRES_PASSWORD"
    print_warn "  - REDIS_PASSWORD"
    echo ""
    read -p "Press Enter to edit .env file now, or Ctrl+C to exit and edit manually..."
    ${EDITOR:-nano} .env
else
    print_info ".env file already exists."
fi

# 10. Install Node.js dependencies
print_info "Installing Node.js dependencies..."
npm install

# 11. Build the project
print_info "Building the project..."
npm run build

# 12. Install admin dashboard dependencies
print_info "Installing admin dashboard dependencies..."
cd admin-dashboard
npm install
npm run build
cd ..

# 13. Start Docker services
print_info "Starting Docker services..."
docker-compose down
docker-compose up -d

# Wait for services to be ready
print_info "Waiting for services to start..."
sleep 10

# 14. Check service status
print_info "Checking service status..."
docker-compose ps

# 15. Run database migrations (if any)
print_info "Running database migrations..."
if [ -d "migrations" ]; then
    # Wait for PostgreSQL to be ready
    print_info "Waiting for PostgreSQL to be ready..."
    sleep 5
    
    # Run migrations using docker-compose
    docker-compose exec -T postgres psql -U postgres -d ai_mcp_gateway -f /docker-entrypoint-initdb.d/001_initial_schema.sql || true
fi

# 16. Set up systemd service for the application
print_info "Setting up systemd service..."
sudo tee /etc/systemd/system/ai-mcp-gateway.service > /dev/null <<EOF
[Unit]
Description=AI MCP Gateway API Server
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ai-mcp-gateway
print_info "Systemd service created and enabled."

# 17. Set up nginx reverse proxy (optional)
print_info "Do you want to set up Nginx as a reverse proxy? (y/n)"
read -p "Answer: " setup_nginx

if [ "$setup_nginx" = "y" ] || [ "$setup_nginx" = "Y" ]; then
    print_info "Installing Nginx..."
    sudo apt install -y nginx

    print_info "Enter your domain name (or press Enter to skip SSL setup):"
    read -p "Domain: " domain_name

    if [ -z "$domain_name" ]; then
        domain_name="localhost"
        print_warn "No domain provided. Nginx will be configured without SSL."
    fi

    # Create Nginx configuration
    sudo tee /etc/nginx/sites-available/ai-mcp-gateway > /dev/null <<EOF
# API Server
server {
    listen 80;
    server_name $domain_name;

    # API endpoints
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Admin Dashboard
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/ai-mcp-gateway /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl restart nginx

    # Set up SSL with Let's Encrypt (if domain provided)
    if [ "$domain_name" != "localhost" ]; then
        print_info "Do you want to set up SSL with Let's Encrypt? (y/n)"
        read -p "Answer: " setup_ssl

        if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
            print_info "Installing Certbot..."
            sudo apt install -y certbot python3-certbot-nginx
            
            print_info "Enter your email for SSL certificate notifications:"
            read -p "Email: " ssl_email

            sudo certbot --nginx -d "$domain_name" --email "$ssl_email" --agree-tos --non-interactive --redirect
            print_info "SSL certificate installed successfully!"
        fi
    fi

    print_info "Nginx configured successfully!"
fi

# 18. Display deployment summary
echo ""
echo "=================================="
echo "Deployment Summary"
echo "=================================="
print_info "✅ System packages updated"
print_info "✅ Docker and Docker Compose installed"
print_info "✅ Node.js and pnpm installed"
print_info "✅ Firewall configured"
print_info "✅ Project cloned and built"
print_info "✅ Docker services started"
print_info "✅ Systemd service created"

echo ""
echo "=================================="
echo "Next Steps"
echo "=================================="
echo "1. Update your .env file with API keys:"
echo "   nano $PROJECT_DIR/.env"
echo ""
echo "2. Restart services:"
echo "   cd $PROJECT_DIR"
echo "   docker-compose restart"
echo "   sudo systemctl restart ai-mcp-gateway"
echo ""
echo "3. Check service status:"
echo "   docker-compose ps"
echo "   sudo systemctl status ai-mcp-gateway"
echo ""
echo "4. View logs:"
echo "   docker-compose logs -f"
echo "   sudo journalctl -u ai-mcp-gateway -f"
echo ""
echo "5. Access your services:"
echo "   - API Server: http://localhost:3000"
echo "   - Admin Dashboard: http://localhost:5173"
if [ "$setup_nginx" = "y" ] || [ "$setup_nginx" = "Y" ]; then
    echo "   - Via Nginx: http://$domain_name"
fi
echo ""
echo "=================================="
print_info "Deployment completed successfully! 🎉"
echo "=================================="
