# 📊 Server Stats Monitoring

## Xem Trạng Thái Server Real-Time

AI MCP Gateway cung cấp endpoint `/v1/server-stats` để theo dõi trạng thái server theo thời gian thực.

## 🔍 Endpoint

### GET /v1/server-stats

Trả về thống kê server hiện tại bao gồm:
- Thời gian hoạt động (uptime)
- Số lượng requests
- Token usage và cost
- Memory usage
- Provider health status
- Database & cache status

### Ví Dụ

```bash
curl http://localhost:3000/v1/server-stats
```

### Response Format

```json
{
  "uptime": {
    "seconds": 3600,
    "formatted": "1h 0m 0s"
  },
  "requests": {
    "total": 150,
    "averageDuration": 234.5
  },
  "llm": {
    "totalCalls": 145,
    "tokens": {
      "input": 12500,
      "output": 45000,
      "total": 57500
    },
    "cost": {
      "total": 0.125,
      "currency": "USD"
    }
  },
  "memory": {
    "heapUsed": 45,
    "heapTotal": 120,
    "rss": 180,
    "external": 5,
    "unit": "MB"
  },
  "providers": {
    "openai": true,
    "anthropic": true,
    "openrouter": true,
    "ossLocal": false
  },
  "cache": {
    "redis": true
  },
  "database": {
    "postgres": true
  },
  "timestamp": "2025-11-29T15:30:00.000Z"
}
```

## 📈 Metrics Tracked

### 1. Uptime
- **seconds**: Tổng thời gian server đã chạy (giây)
- **formatted**: Định dạng dễ đọc (ví dụ: "1h 30m 45s")

### 2. Requests
- **total**: Tổng số HTTP requests đã xử lý
- **averageDuration**: Thời gian xử lý trung bình mỗi request (ms)

### 3. LLM Stats
- **totalCalls**: Tổng số lần gọi LLM
- **tokens.input**: Tổng số input tokens đã sử dụng
- **tokens.output**: Tổng số output tokens đã tạo
- **tokens.total**: Tổng cộng input + output tokens
- **cost.total**: Tổng chi phí (USD)

### 4. Memory Usage
- **heapUsed**: Bộ nhớ heap đang sử dụng (MB)
- **heapTotal**: Tổng bộ nhớ heap (MB)
- **rss**: Resident Set Size - tổng bộ nhớ process (MB)
- **external**: Bộ nhớ external (C++ objects) (MB)

### 5. Provider Health
Status của các LLM providers:
- `true`: Provider đang hoạt động bình thường
- `false`: Provider không available hoặc gặp lỗi
- `{}`: Chưa kiểm tra hoặc không có thông tin

### 6. Services Status
- **cache.redis**: Redis connection status
- **database.postgres**: PostgreSQL connection status

## 🔄 Real-Time Monitoring

### Continuous Monitoring Script

```bash
# Linux/Mac
watch -n 5 'curl -s http://localhost:3000/v1/server-stats | jq'

# Windows PowerShell
while ($true) {
    Clear-Host
    (Invoke-WebRequest http://localhost:3000/v1/server-stats).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
    Start-Sleep -Seconds 5
}
```

### Docker Stats + Server Stats

```bash
# Terminal 1: Docker resource usage
docker stats ai-mcp-gateway

# Terminal 2: Application metrics
watch -n 3 'curl -s http://localhost:3000/v1/server-stats | jq ".requests, .llm, .memory"'
```

## 📊 Database Stats (Historical)

Để xem thống kê lịch sử từ database, sử dụng endpoint `/v1/stats`:

```bash
# Tổng quan
curl http://localhost:3000/v1/stats

# Lọc theo user
curl "http://localhost:3000/v1/stats?userId=user-123"

# Lọc theo thời gian
curl "http://localhost:3000/v1/stats?startDate=2025-11-01&endDate=2025-11-30"

# Group by model
curl "http://localhost:3000/v1/stats?groupBy=model"

# Group by layer
curl "http://localhost:3000/v1/stats?groupBy=layer"
```

## 🎯 Use Cases

### 1. Cost Monitoring
```bash
# Check total cost
curl -s http://localhost:3000/v1/server-stats | jq '.llm.cost'
```

### 2. Token Usage Tracking
```bash
# Check token consumption
curl -s http://localhost:3000/v1/server-stats | jq '.llm.tokens'
```

### 3. Performance Monitoring
```bash
# Check average response time
curl -s http://localhost:3000/v1/server-stats | jq '.requests.averageDuration'
```

### 4. Memory Leak Detection
```bash
# Monitor memory growth over time
curl -s http://localhost:3000/v1/server-stats | jq '.memory.heapUsed'
```

### 5. Provider Availability
```bash
# Check which providers are working
curl -s http://localhost:3000/v1/server-stats | jq '.providers'
```

## 🚨 Alerting Examples

### Cost Alert (Linux/Mac)
```bash
#!/bin/bash
THRESHOLD=10.0
COST=$(curl -s http://localhost:3000/v1/server-stats | jq -r '.llm.cost.total')

if (( $(echo "$COST > $THRESHOLD" | bc -l) )); then
    echo "⚠️ ALERT: Cost exceeded $THRESHOLD USD (Current: $COST)"
    # Send notification (email, Slack, etc.)
fi
```

### Memory Alert (PowerShell)
```powershell
$threshold = 500  # MB
$stats = (Invoke-WebRequest http://localhost:3000/v1/server-stats).Content | ConvertFrom-Json

if ($stats.memory.heapUsed -gt $threshold) {
    Write-Host "⚠️ ALERT: High memory usage: $($stats.memory.heapUsed) MB" -ForegroundColor Red
}
```

## 📱 Integration với Monitoring Tools

### Prometheus
Có thể tạo exporter để expose metrics theo Prometheus format.

### Grafana
Import metrics vào Grafana để tạo dashboard trực quan.

### DataDog/New Relic
Push metrics định kỳ đến monitoring platforms.

## 🔧 Troubleshooting

### Stats không cập nhật
- Kiểm tra server có đang chạy: `curl http://localhost:3000/health`
- Xem logs: `docker-compose logs ai-mcp-gateway`

### Memory tăng liên tục
- Có thể là memory leak
- Restart server: `docker-compose restart ai-mcp-gateway`
- Monitor sau khi restart

### Providers show false
- Kiểm tra API keys trong .env.docker
- Xem provider health logs
- Test connectivity thủ công

---

**Note**: Metrics được lưu trong memory và sẽ reset khi restart server. Để có historical data, sử dụng endpoint `/v1/stats` query từ database.
