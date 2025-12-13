# Production Build & Release Guide

## 📦 Tổng quan

Dự án đã được cấu hình để build bản product release hoàn chỉnh với:
- **Minification**: Code được nén tối ưu qua tsup
- **Obfuscation**: JavaScript được bảo vệ qua javascript-obfuscator
- **Standalone Binaries**: Đóng gói thành executable file (Windows, Linux, macOS) qua @yao-pkg/pkg
- **Git Subtree**: Branch riêng không chứa source code để deploy

## 🚀 Build Production Release

### Bước 1: Build Product

```powershell
npm run build:product
```

Script này sẽ:
1. Build TypeScript với tsup (minified, no sourcemap)
2. Obfuscate JavaScript output
3. Tạo standalone binaries cho Windows/Linux/macOS
4. Copy configs, docs, migrations vào `product/`
5. Tạo README deployment-ready

### Bước 2: Kiểm tra Artifacts

```powershell
# Xem cấu trúc product/
ls product/

# Test binary Windows
.\product\bin\mcp-gateway-win.exe --version

# Test obfuscated JS (fallback)
node product/dist-obfuscated/index.js
```

**Kích thước binaries**:
- Windows: ~40 MB
- Linux: ~52 MB  
- macOS: ~55 MB

### Bước 3: Tạo Git Subtree Release

```powershell
# Tạo branch product-release (không chứa source code)
node scripts/setup-subtree.js
```

Branch `product-release` chỉ chứa:
- ✅ `bin/` - standalone executables
- ✅ `dist-obfuscated/` - obfuscated JavaScript
- ✅ `config/` - .env.example, docker-compose
- ✅ `docs/` - deployment documentation
- ✅ `migrations/` - database migrations
- ✅ `README.md` - user guide

**KHÔNG chứa**:
- ❌ `src/` - source code
- ❌ `tsconfig.json`, `tsup.config.ts` - build configs
- ❌ `tests/` - test files
- ❌ `node_modules/` - dependencies

### Bước 4: Deploy/Publish

#### Option A: Push lên GitHub Release Branch

```powershell
git push origin product-release
```

#### Option B: Push lên Repo riêng

```powershell
# Thêm remote cho product repo
git remote add product-repo https://github.com/yourusername/mcp-gateway-product.git

# Push product-release branch
node scripts/setup-subtree.js push product-repo main
```

#### Option C: Tạo Release Package

```powershell
# Zip toàn bộ product/ để phân phối
Compress-Archive -Path product\* -DestinationPath mcp-gateway-v0.1.0.zip
```

## 📁 Cấu trúc Product Directory

```
product/
├── bin/                          # Standalone binaries
│   ├── mcp-gateway-win.exe      # Windows (40MB)
│   ├── mcp-gateway-linux        # Linux (52MB)
│   └── mcp-gateway-macos        # macOS (55MB)
├── dist-obfuscated/             # Obfuscated JS (fallback)
│   ├── index.js                 # Minified + obfuscated
│   └── index.d.ts
├── config/                      # Configuration templates
│   ├── .env.example
│   ├── docker-compose.yml
│   └── docker-compose.dev.yml
├── docs/                        # Documentation
│   ├── README.md
│   ├── API-GUIDE.md
│   └── DOCKER-DEPLOYMENT.md
├── migrations/                  # Database migrations
│   └── *.sql
├── README.md                    # Deployment guide
└── .gitignore
```

## 🔐 Security Features

### 1. Minification
- Loại bỏ whitespace, comments
- Rút ngắn biến local
- Giảm kích thước file ~60%

### 2. Obfuscation
Cấu hình trong `scripts/postbuild-obfuscate.js`:
- `compact: true` - nén code thành 1 dòng
- `controlFlowFlattening: true` - làm rối logic flow
- `deadCodeInjection: true` - thêm dead code để gây nhiễu
- `stringArray: true` + `base64` encoding - mã hóa strings
- Giữ nguyên shebang (`#!/usr/bin/env node`)

### 3. Binary Packaging
- Đóng gói Node.js runtime + code thành 1 file
- Brotli compression
- Khó đảo ngược hơn JS thuần

### 4. No Source Maps
- Production build không tạo sourcemap
- Attacker không thể reverse dễ dàng

## ⚠️ Lưu ý

### Trade-offs
- **Obfuscation**: Không phải là mã hóa thực sự, chỉ tăng độ khó reverse
- **Binary size**: Lớn hơn vì bundle cả Node.js runtime
- **Debugging**: Khó debug production issues (giữ source code + sourcemap riêng nội bộ)

### Khuyến nghị
- **Sensitive logic**: Đặt trên server, không phân phối client-side
- **API keys**: Luôn dùng env vars, không hard-code
- **Database credentials**: Quản lý qua config files, không commit vào git

## 📋 Scripts Tóm tắt

```json
{
  "build": "tsup",                          // Dev build (có sourcemap)
  "build:prod": "tsup && node scripts/postbuild-obfuscate.js",  // Production build
  "build:product": "node scripts/build-product.js"  // Full release pipeline
}
```

## 🔄 Update Release

Khi cần update product release:

```powershell
# 1. Build lại product
npm run build:product

# 2. Commit changes
git add product/
git commit -m "chore: update product v0.1.x"

# 3. Update subtree branch
git subtree split --prefix=product -b product-release --rejoin

# 4. Push update
git push origin product-release
# hoặc
node scripts/setup-subtree.js push product-repo main
```

## 📞 Support

Xem `docs/` trong product release để biết hướng dẫn deployment chi tiết.
