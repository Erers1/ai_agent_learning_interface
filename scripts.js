/* ================================================================
   scripts.js — Toàn bộ logic cho trang học AI Agent
   ================================================================ */

/* ----------------------------------------------------------------
   ENDPOINT PROXY CỤC BỘ
   Client chỉ gọi đến /api/chat — API key được giấu trong server.js.
   Không đặt token hay key nào ở đây để tránh lộ ra trình duyệt.
   ---------------------------------------------------------------- */
const PROXY_URL = "https://ai-agent-learning-server.onrender.com/api/chat"; // Proxy server xử lý và chuyển tiếp đến KamiMind

/* ----------------------------------------------------------------
   SYSTEM PROMPT — Nhân cách và quy tắc trả lời của Giảng Viên AI.
   Chỉnh sửa tại đây để thay đổi phong cách phản hồi của agent.
   ---------------------------------------------------------------- */
const SYSTEM_PROMPT = `Bạn là một Giảng viên AI uyên bác, nhiệt tình hướng dẫn sinh viên học môn "AI Agent" (Tác tử trí tuệ nhân tạo).

NGUỒN HỌC CHÍNH: https://www.cmu-agents.com/#/schedule, có thể kèm theo các trang khác nếu không thấy nội dung cần tìm

QUY TẮC PHẢN HỒI BẮT BUỘC (theo 4 phần, trình bày rõ ràng):
1. 📌 TÓM TẮT: 2-3 câu ngắn gọn đúc kết câu trả lời trọng tâm.
2. 💡 GIẢI THÍCH & VÍ DỤ: Phân tích cặn kẽ bản chất, kèm ví dụ thực tế hoặc sơ đồ minh họa.
3. 🔗 NGUỒN THAM KHẢO: Ghi rõ tên tài liệu và URL đã sử dụng.
4. ❓ CÂU HỎI ÔN TẬP: Đúng 1 câu hỏi ngắn để sinh viên tự kiểm tra.

Luôn trả lời bằng tiếng Việt, phong cách thân thiện nhưng học thuật. Nếu câu hỏi nằm ngoài chủ đề AI Agent, nhẹ nhàng hướng sinh viên trở lại chủ đề. Nếu không tìm thấy thông tin thì trả về "Thông tin này hiện không có trong tài liệu học, bạn có thể hỏi thêm chi tiết hoặc xem lại nội dung học."`;

/* ----------------------------------------------------------------
   LỊCH SỬ HỘI THOẠI (story_id)
   API KamiMind dùng story_id rỗng để bắt đầu cuộc trò chuyện mới.
   Nếu API trả về story_id, lưu lại để duy trì ngữ cảnh hội thoại.
   ---------------------------------------------------------------- */
let storyId = "";

/* ================================================================
   HÀM GỬI TIN NHẮN QUA PROXY SERVER (/api/chat)
   Server sẽ tự gắn API key và chuyển tiếp đến KamiMind.
   ================================================================ */
async function sendMessageToAgent(userMessage) {
    // Gửi JSON đơn giản lên proxy — không có key nào ở đây
    const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            story_id: storyId,
            // Ghép system prompt vào message để định hướng agent
            message: `[SYSTEM CONTEXT]\n${SYSTEM_PROMPT}\n\n[USER]\n${userMessage}`,
        }),
    });

    if (!response.ok) {
        throw new Error(`Lỗi proxy: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Cấu trúc phản hồi thực tế: { success, message, data: { message, story_id } }
    if (!data.success) {
        throw new Error(data.message ?? "API trả về lỗi không xác định.");
    }

    // Lưu story_id để duy trì ngữ cảnh hội thoại cho các lượt tiếp theo
    if (data.data?.story_id) storyId = data.data.story_id;

    // Nội dung phản hồi nằm trong data.data.message
    return data.data?.message ?? "Xin lỗi, tôi không nhận được phản hồi từ máy chủ. Vui lòng thử lại.";
}

/* ================================================================
   THAO TÁC UI CHATBOX
   ================================================================ */
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");

/* Thêm một bong bóng tin nhắn vào khu vực chat */
function appendMessage(role, content) {
    const wrapper = document.createElement("div");
    wrapper.className = `msg ${role}`;                    // "ai" hoặc "user"

    if (role === "ai") {
        wrapper.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">${content}</div>`;
    } else {
        wrapper.innerHTML = `<div class="msg-bubble">${escapeHtml(content)}</div>`;
    }

    chatMessages.appendChild(wrapper);
    scrollToBottom();
    return wrapper;
}

/* Hiển thị hiệu ứng "đang gõ..." trong khi chờ API */
function showTyping() {
    const wrapper = document.createElement("div");
    wrapper.className = "msg ai";
    wrapper.id = "typing-msg";
    wrapper.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="typing-indicator">
      <span></span><span></span><span></span>
    </div>`;
    chatMessages.appendChild(wrapper);
    scrollToBottom();
}

/* Xoá hiệu ứng "đang gõ..." sau khi nhận được phản hồi */
function hideTyping() {
    const el = document.getElementById("typing-msg");
    if (el) el.remove();
}

/* Cuộn khu vực chat xuống cuối sau mỗi tin mới */
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* Thoát ký tự đặc biệt HTML để tránh XSS từ input người dùng */
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* Luồng chính: lấy input → hiển thị → gọi API → hiển thị phản hồi */
async function handleSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Hiển thị tin nhắn người dùng và xoá input
    appendMessage("user", text);
    chatInput.value = "";
    chatInput.style.height = "auto";   // reset chiều cao textarea

    // Khoá nút gửi và hiển thị hiệu ứng chờ
    sendBtn.disabled = true;
    showTyping();

    try {
        const reply = await sendMessageToAgent(text);
        hideTyping();
        // Thay thế ký tự xuống dòng bằng <br> để hiển thị đúng trong HTML
        appendMessage("ai", reply.replace(/\n/g, "<br>"));
    } catch (err) {
        hideTyping();
        appendMessage("ai", `⚠️ <strong>Lỗi kết nối:</strong> ${escapeHtml(err.message)}<br>Vui lòng kiểm tra kết nối mạng và thử lại.`);
        console.error("[KamiMind API Error]", err);
    } finally {
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

/* ================================================================
   SỰ KIỆN NGƯỜI DÙNG
   ================================================================ */

/* Bấm nút gửi */
sendBtn.addEventListener("click", handleSend);

/* Nhấn Enter để gửi (Shift+Enter = xuống dòng mới) */
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

/* Textarea tự giãn chiều cao theo nội dung người dùng gõ */
chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
});

/* ================================================================
   CÂU HỎI GỢI Ý — Bấm để gửi thẳng vào chatbox
   ================================================================ */

/* Điền câu hỏi vào ô input rồi tự động gửi */
function sendSuggestedQuestion(text) {
    chatInput.value = text;
    handleSend();
    // Cuộn trang xuống khu vực chatbox trên mobile
    document.getElementById("chat-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ================================================================
   TOAST THÔNG BÁO (giữ lại cho trường hợp cần dùng)
   ================================================================ */
function showToast(msg = "Đã sao chép vào bộ nhớ tạm!") {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.className = "show";
    setTimeout(() => {
        toast.className = toast.className.replace("show", "").trim();
    }, 2500);
}
