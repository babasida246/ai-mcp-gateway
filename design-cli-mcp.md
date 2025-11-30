Dưới đây là một **prompt dài, chi tiết** bạn có thể copy/paste vào GitHub Copilot / Claude on VS Code để nó sinh ra **CLI tool kiểu “Claude CLI”**, dùng qua SSH để hỗ trợ bạn phát triển code.

Bạn chỉ cần chỉnh lại vài chỗ như tên project, ngôn ngữ (Node/Python), giao thức gọi MCP server, v.v.

---

## Prompt gợi ý cho GitHub Copilot / Claude

> Bạn là một senior engineer. Hãy giúp tôi thiết kế và hiện thực một CLI tool dùng để tương tác với AI coding assistant nội bộ (MCP server của tôi), tương tự trải nghiệm của Claude CLI.
>
> Mục tiêu:
>
> * Tôi thường SSH vào server (Ubuntu) để phát triển code.
> * Tôi muốn dùng CLI này trong terminal (qua SSH) để:
>
>   1. Chat với AI theo ngữ cảnh thư mục hiện tại (repo code).
>   2. Gửi file hoặc đoạn code (stdin / file path) cho AI nhờ phân tích / refactor / viết test.
>   3. Nhận về gợi ý sửa code dưới dạng:
>
>      * plain text (giải thích),
>      * hoặc patch/diff kiểu unified diff để tôi có thể apply bằng `git apply` hoặc lệnh riêng.
> * CLI sẽ gọi tới MCP server của tôi qua HTTP/HTTPS với API rất đơn giản.
>
> Giả định API MCP (có thể chỉnh trong code):
>
> * METHOD: POST
> * URL: lấy từ biến môi trường `MCP_ENDPOINT` (vd: `http://localhost:8000/chat`), nếu không có thì dùng default.
> * AUTH: nếu có `MCP_API_KEY` thì gửi header `Authorization: Bearer <MCP_API_KEY>`.
> * Request JSON:
>
>   ```json
>   {
>     "mode": "chat" | "code" | "diff",
>     "prompt": "câu hỏi hoặc yêu cầu của người dùng",
>     "context": {
>       "cwd": "/path/to/current/dir",
>       "files": [
>         {
>           "path": "relative/path/to/file.ext",
>           "language": "typescript",
>           "content": "nội dung file hoặc đoạn code"
>         }
>       ],
>       "extra": {
>         "shell": "bash",
>         "editor": "vim | nano | code-server | ...",
>         "git_status": "output rút gọn của git status (nếu có)"
>       }
>     }
>   }
>   ```
> * Response JSON (tối thiểu):
>
>   ```json
>   {
>     "message": "nội dung trả lời dạng text cho người dùng",
>     "patch": "optional unified diff nếu có đề xuất sửa code",
>     "metadata": {
>       "tokens": 1234,
>       "model": "oss-20b"
>     }
>   }
>   ```
>
>   Trong đó:
>
>   * `message`: text sẽ in ra màn hình cho user đọc.
>   * `patch`: nếu có, là unified diff để có thể apply.
>
> Yêu cầu về CLI:
>
> 1. Viết bằng Node.js (TypeScript) **hoặc** Python (tự chọn một và nhất quán, tôi ưu tiên TypeScript).
> 2. Dùng cấu trúc project sạch, dễ maintain:
>
>    * Nếu dùng TypeScript:
>
>      * `src/index.ts`: entry point, parse args, gọi các hàm chính.
>      * `src/client.ts`: logic gọi MCP server (HTTP client).
>      * `src/commands/chat.ts`: xử lý lệnh chat cơ bản.
>      * `src/commands/code.ts`: xử lý lệnh gửi file/đoạn code.
>      * `src/commands/diff.ts`: xử lý lệnh sinh patch/diff.
>      * `package.json`: khai báo script `cli`, `build`.
>    * Nếu dùng Python:
>
>      * `mcp_cli/__main__.py`: entry point.
>      * `mcp_cli/client.py`: HTTP client.
>      * `mcp_cli/commands/chat.py`, `code.py`, `diff.py`.
> 3. CLI có thể cài đặt global:
>
>    * Với Node: package.json có `bin` trỏ tới file build (vd: `"mcp": "dist/index.js"`), và có shebang.
>    * Tôi có thể chạy: `mcp chat "giải thích file này"` hoặc `mcp code path/to/file.py --prompt "refactor giúp tôi"`.
> 4. Cú pháp lệnh (gợi ý):
>
>    * `mcp chat "tin nhắn"`
>
>      * Gửi 1 tin nhắn đơn, không file.
>    * `mcp chat`
>
>      * Mở chế độ interactive: user gõ nhiều dòng, nhấn Enter để gửi từng message, có history trong phiên.
>    * `mcp code path/to/file.ext -p "hãy review file này"`
>
>      * Đọc file, gửi nội dung + prompt.
>    * `mcp code - < path/to/file.ext`
>
>      * Đọc từ stdin (pipe) và gửi nội dung.
>    * `mcp diff path/to/file.ext -p "sửa bug ở hàm X"`
>
>      * Yêu cầu server trả về unified diff trong field `patch`, CLI in riêng phần diff để tôi dễ pipe qua `git apply`.
> 5. Features kỹ thuật:
>
>    * Dùng thư viện parse argument phù hợp:
>
>      * TypeScript/Node: `commander` hoặc `yargs`.
>      * Python: `argparse` hoặc `typer`.
>    * Đọc biến môi trường:
>
>      * `MCP_ENDPOINT`, `MCP_API_KEY`.
>      * Cho phép override bằng flag `--endpoint` hoặc `--api-key`.
>    * Xử lý lỗi rõ ràng:
>
>      * Nếu server trả 4xx/5xx: in response body (nếu có) + code.
>      * Nếu không gọi được endpoint: hiển thị thông báo gợi ý kiểm tra URL / network.
>    * In output đẹp:
>
>      * `message`: in thẳng ra stdout.
>      * `patch`: nếu có, in sau phần message, có separator rõ ràng, vd:
>
>        ```
>        --- MCP MESSAGE ---
>        ...
>        --- MCP PATCH (unified diff) ---
>        diff --git ...
>        ```
> 6. Hãy:
>
>    * Viết full code cho toàn bộ file quan trọng (không chỉ pseudo code).
>    * Thêm comment giải thích những đoạn chính.
>    * Nếu dùng TypeScript:
>
>      * Cấu hình `tsconfig.json`.
>      * Thêm script `npm run build` để build ra `dist/`.
>      * Thêm hướng dẫn sơ bộ trong comment: cách cài (`npm install -g .`) và cách chạy (`mcp chat ...`).
>    * Đảm bảo code chạy được trong môi trường Linux (Ubuntu) qua SSH.
> 7. Đầu ra mong muốn:
>
>    * Một bộ code hoàn chỉnh cho CLI tool như mô tả.
>    * Có thể copy nguyên project về, `npm install`, `npm run build`, sau đó `npm install -g .` là dùng được.
>    * Hạn chế phụ thuộc quá nhiều vào thư viện lạ; ưu tiên lib phổ biến.
>
> Hãy trả lời bằng:
>
> * Danh sách file và nội dung chi tiết từng file (code hoàn chỉnh).
> * Gợi ý một số lệnh mẫu để tôi test.
>
> Nếu có assumptions thêm về API hoặc cấu hình, hãy ghi rõ trong comment đầu file chính.

---

## Cách dùng (gợi ý)

* Mở VS Code / repo bạn muốn chứa CLI.
* Tạo file trống (vd: `design-cli-mcp.md`) hoặc mở sẵn terminal.
* Gọi GitHub Copilot Chat / Claude (như “@github-copilot /chat” hoặc panel Claude in VS Code).
* Dán nguyên prompt trên.
* Nếu cần, nhắc lại:

  * “Hãy dùng TypeScript + Node.js”
  * hoặc “Hãy dùng Python + Typer”.
