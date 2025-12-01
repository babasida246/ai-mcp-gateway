# Admin Dashboard - Feature Documentation

## 📊 Tổng quan các tính năng

Admin Dashboard hiện có **8 trang chính** với đầy đủ tính năng quản lý:

### 1. 📈 Dashboard (Trang chủ)
**Mục đích**: Giám sát hệ thống real-time

**Tính năng**:
- ✅ Metrics tổng quan: Total Requests, Total Cost, Total Tokens, Avg Latency
- ✅ Layer Status: Trạng thái từng layer (L0-L3)
- ✅ Service Status: Database, Redis, Providers health check
- ✅ Auto-refresh mỗi 5 giây
- ✅ Color-coded status badges

**Công nghệ**: React hooks (useState, useEffect), Axios, Lucide icons

---

### 2. 📊 Analytics (MỚI)
**Mục đích**: Phân tích sâu về hiệu suất và chi phí

**Tính năng**:
- ✅ **Time-range selector**: 1h, 24h, 7d, 30d
- ✅ **Key Metrics với trends**:
  - Total Requests với % thay đổi
  - Total Cost với % thay đổi
  - Average Latency với % thay đổi
  - Success Rate với % thay đổi
- ✅ **Request Timeline**: Biểu đồ cột interactive hiển thị requests theo thời gian
- ✅ **Model Usage**: Progress bars cho từng model với metrics:
  - Số lượng requests
  - Chi phí ($)
  - Average latency
  - % of total requests
- ✅ **Cost Breakdown by Layer**: Phân tích chi phí theo từng layer
- ✅ **Top Errors**: Thống kê lỗi phổ biến

**Nghiên cứu từ**: Grafana, Datadog, New Relic

---

### 3. 🔑 Gateway Tokens
**Mục đích**: Quản lý API tokens

**Tính năng**:
- ✅ **Tạo token mới**: Sinh tự động token với prefix `gmcp_`
- ✅ **Show/Hide token**: Toggle visibility với mask
- ✅ **Copy to clipboard**: Copy nhanh token
- ✅ **Delete token**: Xóa với confirmation
- ✅ **Token metadata**: Created date, Last used date
- ✅ **Usage example**: Code snippet với curl command

---

### 4. 📦 Docker Logs
**Mục đích**: Real-time log viewer

**Tính năng**:
- ✅ **Container selector**: Filter theo container (all/gateway/postgres/redis/dashboard)
- ✅ **Search filter**: Tìm kiếm trong logs
- ✅ **Pause/Resume**: Tạm dừng log streaming
- ✅ **Auto-scroll toggle**: Bật/tắt tự động scroll
- ✅ **Download logs**: Export ra file .txt
- ✅ **Clear logs**: Xóa logs hiện tại
- ✅ **Color-coded log levels**: info (blue), warn (yellow), error (red), debug (gray)

---

### 5. 🌐 Providers (CẢI TIẾN)
**Mục đích**: Quản lý AI providers

**Tính năng MỚI**:
- ✅ **Enable/Disable provider**: Toggle on/off từng provider
- ✅ **Edit API Key**: Cập nhật API key với show/hide password
- ✅ **Base URL configuration**: Cấu hình custom endpoint (OpenRouter, OSS Local)
- ✅ **Save configuration**: Lưu thay đổi với feedback message
- ✅ **Health status**: Real-time health check
- ✅ **Provider metadata**: Description, status badge
- ✅ **Expandable config panel**: Click Settings để mở form edit

**Providers hỗ trợ**:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3.5)
- OpenRouter (Multi-provider gateway)
- OSS Local (Self-hosted models)

---

### 6. 🤖 Models (CẢI TIẾN)
**Mục đích**: Quản lý models và layers

**Tính năng MỚI**:
- ✅ **Enable/Disable layer**: Toggle on/off từng layer (L0-L3)
- ✅ **Add model**: Thêm model mới vào layer với input form
- ✅ **Remove model**: Xóa model khỏi layer (hover để hiện nút xóa)
- ✅ **Edit mode**: Click "Edit Models" để vào chế độ chỉnh sửa
- ✅ **Real-time feedback**: Toast notification khi thêm/xóa
- ✅ **Model count**: Hiển thị số lượng models trong layer
- ✅ **Provider tags**: Danh sách providers cho mỗi layer

**Layer hierarchy**:
- **L0**: Free Tier (openrouter-llama-3.3-70b-free, openrouter-grok-free)
- **L1**: Low Cost (openrouter-gpt-4o-mini)
- **L2**: Balanced (openrouter-claude-haiku, openrouter-gpt-4o)
- **L3**: Premium (openrouter-claude-sonnet)

---

### 7. 🔔 Alerts (MỚI)
**Mục đích**: Cấu hình cảnh báo tự động

**Tính năng**:
- ✅ **Create alert**: Tạo alert mới với:
  - Alert name
  - Metric type (cost, latency, errors, uptime)
  - Condition (greater_than, less_than, equal_to)
  - Threshold value
  - Notification channels (email, Slack, webhook)
- ✅ **Enable/Disable alert**: Toggle alert on/off
- ✅ **Delete alert**: Xóa alert với confirmation
- ✅ **Toggle channels**: Bật/tắt từng kênh thông báo
- ✅ **Visual indicators**: Icons và color-coding theo metric type

**Alert types**:
- 💰 Cost: Cảnh báo chi phí vượt ngưỡng
- ⏱️ Latency: Cảnh báo độ trễ cao
- ⚠️ Errors: Cảnh báo tỷ lệ lỗi tăng
- ✅ Uptime: Cảnh báo downtime

**Notification channels**:
- 📧 Email
- 💬 Slack
- 🔗 Webhook

---

### 8. ⚙️ Settings
**Mục đích**: Cấu hình hệ thống

**Tính năng**:
- ✅ **General Settings**:
  - Log Level (debug, info, warn, error)
  - Default Layer (L0-L3)
- ✅ **Routing Features**:
  - Cross-Check (validate responses)
  - Auto Escalate (escalate on failure)
  - Max Escalation Layer
- ✅ **Cost Management**:
  - Enable Cost Tracking
  - Cost Alert Threshold
- ✅ **Layer Control**: Enable/disable từng layer
- ✅ **Task-Specific Models**: Cấu hình models cho tasks:
  - chat
  - code
  - analyze
  - createProject
- ✅ **Save Changes**: Lưu configuration với success feedback

---

## 🎨 UI/UX Design Principles

### Nghiên cứu từ các dashboard hiện đại

**1. Grafana**:
- ✅ Time-range selector
- ✅ Interactive charts
- ✅ Auto-refresh intervals
- ✅ Panel-based layout

**2. Datadog**:
- ✅ Real-time metrics
- ✅ Color-coded status
- ✅ Trend indicators (up/down arrows)
- ✅ Cost tracking

**3. Vercel Dashboard**:
- ✅ Clean minimalist design
- ✅ Dark theme
- ✅ Card-based layout
- ✅ Smooth animations

**4. Stripe Dashboard**:
- ✅ Financial metrics
- ✅ Usage graphs
- ✅ API key management
- ✅ Alert configuration

### Color System
```css
Background: #0f172a (slate-900)
Cards: #1e293b (slate-800)
Text Primary: #ffffff (white)
Text Secondary: #94a3b8 (slate-400)
Success: #22c55e (green-500)
Error: #ef4444 (red-500)
Warning: #f59e0b (yellow-500)
Info: #3b82f6 (blue-500)
```

### Typography
- **Headings**: Inter, bold, 24-32px
- **Body**: Inter, regular, 14-16px
- **Code**: Mono, 12-14px

---

## 🚀 Tính năng nâng cao đã thêm

### 1. **Provider Management**
- **Before**: Chỉ xem status
- **After**: 
  - Enable/disable providers
  - Edit API keys với password toggle
  - Configure base URLs
  - Save configuration per provider

### 2. **Model Management**
- **Before**: Chỉ xem danh sách
- **After**:
  - Enable/disable layers
  - Add/remove models dynamically
  - Edit mode với form validation
  - Real-time feedback

### 3. **Analytics Dashboard**
- **NEW**: Trang phân tích hoàn toàn mới
  - Time-series visualization
  - Model usage breakdown
  - Cost analysis by layer
  - Error tracking

### 4. **Alert System**
- **NEW**: Hệ thống cảnh báo tự động
  - Multi-channel notifications
  - Flexible conditions
  - Enable/disable alerts
  - Visual alert management

---

## 📱 Responsive Design

Tất cả trang đều responsive với breakpoints:
- **Mobile**: < 768px (1 column)
- **Tablet**: 768px - 1024px (2 columns)
- **Desktop**: > 1024px (3-4 columns)

Mobile menu với hamburger icon khi < 1024px.

---

## 🔧 Tech Stack

**Frontend**:
- React 19.2.0
- TypeScript 5.9.3
- Vite 7.2.5 (Rolldown)
- Tailwind CSS 3.4.0
- React Router 7
- Axios
- Lucide React (icons)

**Backend API Integration**:
- GET /health - System health check
- GET /v1/server-stats - Request metrics
- (Future) POST/PUT/DELETE endpoints cho CRUD operations

**Container**:
- Docker multi-stage build
- Nginx Alpine
- Port 5173 → 80

---

## 🎯 Roadmap tiếp theo

**Phase 1**: Backend API endpoints
- [ ] POST /providers/:id/config - Save provider config
- [ ] PUT /layers/:id - Update layer settings
- [ ] POST /layers/:id/models - Add model to layer
- [ ] DELETE /layers/:id/models/:modelId - Remove model
- [ ] POST /alerts - Create alert
- [ ] PUT /alerts/:id - Update alert

**Phase 2**: Real-time features
- [ ] WebSocket cho live logs
- [ ] Server-Sent Events cho metrics
- [ ] Real-time notifications

**Phase 3**: Advanced analytics
- [ ] Custom date range picker
- [ ] Export reports (PDF/CSV)
- [ ] Cost forecasting
- [ ] Model performance comparison

**Phase 4**: User management
- [ ] Multi-user support
- [ ] Role-based access control (RBAC)
- [ ] Audit logs
- [ ] API usage quotas per user

---

## 📝 Usage Examples

### Thêm model mới vào layer
```typescript
1. Navigate to /models
2. Click "Edit Models" button trên layer cần thêm
3. Nhập tên model (e.g., "openrouter-gpt-4-turbo")
4. Click "Add" hoặc nhấn Enter
5. Model sẽ xuất hiện trong danh sách
6. Click "Close" để thoát edit mode
```

### Cấu hình provider API key
```typescript
1. Navigate to /providers
2. Click Settings icon trên provider card
3. Click eye icon để show/hide current key
4. Nhập API key mới
5. (Optional) Cập nhật Base URL
6. Click "Save Configuration"
7. Thông báo success sẽ hiện trong 3 giây
```

### Tạo cost alert
```typescript
1. Navigate to /alerts
2. Click "Create Alert"
3. Nhập alert name (e.g., "Daily Cost Limit")
4. Chọn Metric Type: "Cost"
5. Chọn Condition: "Greater than"
6. Nhập Threshold: 10 ($)
7. Chọn channels: email ✓, slack ✓
8. Click "Create Alert"
9. Alert sẽ active ngay lập tức
```

---

## 🎓 Best Practices

### Performance
- ✅ Use React.memo cho heavy components
- ✅ Debounce search inputs
- ✅ Lazy load charts
- ✅ Virtual scrolling cho long lists

### Security
- ✅ Mask sensitive data (API keys, tokens)
- ✅ Confirm destructive actions
- ✅ Validate inputs
- ✅ Sanitize user input

### UX
- ✅ Loading states
- ✅ Error handling with retry
- ✅ Success feedback
- ✅ Keyboard shortcuts
- ✅ Accessibility (ARIA labels)

---

**Version**: 2.0.0  
**Last Updated**: December 1, 2025  
**Author**: AI MCP Gateway Team
