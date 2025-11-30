# Tính năng mới của `ai-mcp-gateway`

Tài liệu này tổng hợp các tính năng kiến trúc & chức năng mới được bổ sung cho `ai-mcp-gateway`.

---

## 1. Stateless HTTP API Gateway

### Mục tiêu

* Cho phép nhiều client bên ngoài (CLI, Telegram bot, web UI, n8n, GitHub Actions, …) gọi vào gateway qua HTTP.
* Đảm bảo **stateless** ở tầng application: mọi context được lưu ở Redis + Database.

### Đặc điểm chính

* Endpoint ví dụ:

  * `POST /v1/code-agent` – gọi AI Code Agent.
  * `POST /v1/route` – gọi router tổng quát (không chỉ code).
  * (Tuỳ chọn) `/v1/cache/clear`, `/v1/stats/usage`, `/v1/stats/conversation/:id` …

* Request body (ví dụ):

  ```json
  {
    "conversation_id": "optional-or-null",
    "user_id": "optional-or-null",
    "message": "Yêu cầu hiện tại của người dùng",
    "mode": "cli | web | mcp | telegram | ci",
    "metadata": {
      "project": "optional",
      "quality": "normal | high | critical",
      "client": "cli | telegram | ..."
    }
  }
  ```

* Response body (ví dụ):

  ```json
  {
    "result": {
      "text": "Nội dung trả lời đã hợp nhất",
      "todo": "Markdown TODO list nếu có",
      "code": "Đoạn code chính nếu có"
    },
    "routingSummary": {
      "layersUsed": ["L0", "L1"],
      "models": ["oss_coder_main", "sonnet-4"],
      "fromCache": false
    },
    "context": {
      "conversationId": "abc123",
      "updatedSummary": "Tóm tắt context sau request"
    }
  }
  ```

* Gateway không giữ state lâu trong RAM: mọi thứ cần nhớ được load từ Redis/DB & ghi trả lại sau mỗi request.

---

## 2. Redis Cache Layer

### Mục tiêu

* Tăng tốc, giảm chi phí LLM bằng cache kết quả & context summary.
* Là tầng “nóng” cho context.

### Sử dụng Redis

* Các key gợi ý:

  * `llm:cache:{model_id}:{prompt_hash}`
  * `conv:summary:{conversation_id}`
  * `routing:hints:{project_id}`

* Quy trình:

  1. Khi nhận request:

     * Kiểm tra cache (ví dụ `llm:cache:...` cho prompt tương tự).
  2. Nếu **HIT**:

     * Trả về nhanh, kèm `routingSummary.fromCache = true`.
  3. Nếu **MISS**:

     * Gọi LLM, sau đó `SET` lại cache với TTL.

* Redis dùng để:

  * Lưu **summary context** cho `conversation_id`.
  * Lưu **routing hints / feature flags** nếu cần.

---

## 3. Database Persistence (Postgres, v.v.)

### Mục tiêu

* Lưu trữ dài hạn:

  * Conversation, message, summary, log LLM, metrics.
* Hỗ trợ phân tích chi phí, chất lượng & self-improvement.

### Bảng gợi ý

* `conversations`

  * `id`, `user_id`, `project`, `created_at`, `updated_at`, …
* `messages`

  * `id`, `conversation_id`, `role` (user/assistant/tool), `content`, `created_at`, …
* `context_summaries`

  * `id`, `conversation_id`, `summary`, `updated_at`, …
* `llm_calls`

  * `id`, `conversation_id`, `model_id`, `layer`, `tokens_in`, `tokens_out`, `cost_estimate`, `created_at`, …

### Mối quan hệ Redis – DB

* Redis = dữ liệu **nóng, ngắn hạn** (summary, cache).
* DB = dữ liệu **dài hạn, phân tích** (log đầy đủ, lịch sử conversation).
* Khi Redis MISS:

  * Có thể dùng DB để rebuild summary & set lại vào Redis.

---

## 4. Ghi nhớ context / conversation bằng Redis + DB

### Nguyên tắc

* Context được quản lý theo `conversation_id`.
* Mỗi request HTTP phải truyền (hoặc được server tạo) `conversation_id`.

### Tầng nóng (Redis)

* Lưu **summary ngắn gọn** cho mỗi `conversation_id`:

  * Stack hiện tại (TS/SvelteKit/Postgres, …).
  * Kiến trúc đã chốt.
  * Module/file chính đang làm.
  * TODO list & tiến độ.
* Quy trình:

  1. Load `conv:summary:{conversation_id}`.
  2. Kết hợp với message mới → build prompt.
  3. Sau khi xử lý:

     * Cập nhật summary mới → ghi lại vào Redis.

### Tầng lạnh (DB)

* Lưu toàn bộ lịch sử message & summary.
* Dùng để:

  * Khôi phục context nếu Redis mất.
  * Phân tích/học hỏi pattern sử dụng & bug.

### Tóm tắt context khi dài

* Không forward raw toàn bộ history cho LLM khi hội thoại dài.
* Thay vào đó:

  * Lấy một số message gần đây + summary.
  * Sinh **summary mới ngắn gọn** (tự động).
  * Ghi summary mới vào Redis + DB.
  * Dùng summary + messages gần nhất để build prompt.

---

## 5. N-layer Dynamic Routing & Handoff tối ưu

### N-layer dynamic routing

* Chia model thành nhiều layer theo chi phí & chất lượng:

  * `L0` – free / OSS / local / rẻ nhất.
  * `L1 ... L(K-1)` – model tầm trung.
  * `LK` – model premium / đắt nhất.

* Nguyên tắc:

  * Luôn bắt đầu từ **layer thấp nhất phù hợp**.
  * **Cross-check** trong cùng layer trước (A draft, B review, C trọng tài nếu cần).
  * Chỉ **escalate** lên layer cao hơn khi:

    * Task phức tạp / critical.
    * Layer dưới mâu thuẫn hoặc không giải được bài toán.
    * User yêu cầu model “mạnh nhất”.

### Handoff giữa các layer

Khi chuyển từ layer Lk → L(k+1), layer dưới **tối ưu prompt** thành một “handoff package” trước khi gọi layer cao hơn.

Gợi ý format:

```text
[CONTEXT-SUMMARY]
- Tóm tắt project: stack, kiến trúc chính, module liên quan.
- Quyết định quan trọng đã chốt.

[CURRENT-TASK]
- Yêu cầu cụ thể cần giải lúc này.
- Các file/hàm/module liên quan.

[ATTEMPTS-SO-FAR]
- Các approach đã thử ở layer dưới.
- Đoạn code/giải pháp đang sử dụng (CHỌN LỌC).
- Kết quả test (pass/fail, log chính).

[KNOWN-ISSUES-AND-OPEN-QUESTIONS]
- Bug/issue còn tồn tại.
- Điểm mâu thuẫn giữa các model (nếu có).

[WHAT-I-WANT-FROM-HIGHER-LAYER]
- Yêu cầu rõ ràng: review kiến trúc, tối ưu code, debug lỗi, đề xuất thiết kế mới, v.v.
```

Trước khi escalate:

1. **Nén context**: dùng summary + messages gần đây, loại noise.
2. **Làm rõ mục tiêu**: ghi rõ mong muốn đối với layer cao hơn.
3. **Đính kèm tối thiểu đủ dùng**: trích code quan trọng, không dump full file nếu không cần.

Khi layer cao hơn trả kết quả:

* Layer dưới:

  * Cập nhật summary context (Redis + DB).
  * Cập nhật TODO list (bước “nhờ layer cao hơn” → done).
  * Tích hợp code/kiến trúc mới vào giải pháp hiện tại.

---

## 6. Code Agent: TODO, Test, Self-improvement

(Đã có trước đó, nhưng gắn chặt với context mới.)

### TODO list kiểu GitHub Copilot

* Với task không trivial, luôn sinh:

  ```md
  Kế hoạch (TODO):
  - [ ] Bước 1: ...
  - [ ] Bước 2: ...
  - [ ] Bước 3: ...
  ```

* TODO được lưu trong context:

  * Ghi trong summary (Redis).
  * Ghi vào DB nếu có tool.

### Tích hợp test

* Gọi các tool test (nếu có):

  * `Vitest`, `Playwright`, `pytest`, `phpunit`, …
* Chạy test:

  * Đọc log fail → sửa code → chạy lại.
* Khi gặp bug lớn:

  * Tạo regression test mới (thêm file vào `tests/regression`).

### Self-improvement

* Ghi nhận pattern bug & cách fix vào docs:

  * `docs/ai-routing-heuristics.md`
  * `docs/ai-common-bugs-and-fixes.md`
* Log `llm_calls` + cost để tune routing (ưu tiên model nào, layer nào).

---

## 7. Client tách biệt: CLI qua HTTP API

### Kiến trúc

* **CLI không nằm trong cùng process** với MCP server.
* CLI là **project/client tách biệt**, chỉ gọi HTTP API của gateway.

### Hành vi CLI (ví dụ)

* `ai-mcp code "<prompt>" [--conv <id>]`

  * Gửi `POST /v1/code-agent` với:

    * `conversation_id` = `--conv` hoặc tạo mới (`cli:<uuid>`).
    * `mode = "cli"`, `metadata.client = "cli"`.
* `ai-mcp route "<prompt>"`:

  * Gửi `POST /v1/route`.
* (Tuỳ chọn) `ai-mcp cache ...`, `ai-mcp stats ...`:

  * Gọi các endpoint quản lý cache/stats.

### Quản lý context

* CLI chỉ cần giữ lại **`conversation_id`** (vd. trong file config hoặc copy dùng lại).
* Toàn bộ history/conversation thực tế nằm ở Redis + DB trong gateway.

---

## 8. Client tách biệt: Telegram Bot

### Mục tiêu

* Cho phép gửi prompt/code request trực tiếp qua Telegram.
* Bot chỉ là client HTTP của gateway.

### Nguyên tắc

* Mỗi **Telegram `chat_id`** được map thành một `conversation_id`:

  * `conversation_id = "tg:{chat_id}"`

* Bot:

  1. Nhận message từ user.

  2. Gửi `POST /v1/code-agent`:

     ```json
     {
       "conversation_id": "tg:123456789",
       "message": "Yêu cầu từ Telegram",
       "mode": "telegram",
       "metadata": {
         "client": "telegram",
         "telegram_chat_id": 123456789
       }
     }
     ```

  3. Nhận JSON response, gửi `result.text` (và code nếu có) về lại chat.

* Gateway xử lý:

  * Load context `tg:chat_id` từ Redis/DB.
  * Dùng code agent + routing N-layer.
  * Cập nhật summary, log, metrics.

---

## 9. Tổng kết

Các tính năng mới đưa `ai-mcp-gateway` lên thành một **nền tảng AI đa client, đa model, có hạ tầng nhớ context đầy đủ**:

* Stateless HTTP API làm “trục chính”.
* Redis + Database để **ghi nhớ conversation & context** lâu dài.
* N-layer dynamic routing + handoff tối ưu giữa các layer.
* Code agent có TODO, test, self-improvement.
* Client bên ngoài:

  * CLI tách biệt (gọi HTTP API).
  * Telegram bot (chat → gateway).
* Toàn bộ bộ nhớ, routing, cross-check, tối ưu chi phí đều nằm phía sau gateway, giúp bạn có thể thêm client mới mà **không sửa logic lõi**.
