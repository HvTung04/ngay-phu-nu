# Ngày Phụ Nữ — Game đua tay (LG Innotek)

Máy chiếu ở văn phòng + tối đa 12 điện thoại làm tay cầm. Server chạy trên máy ở nhà, domain trỏ vào đó.

## Chạy

```bash
npm install
npm start
```

Mặc định cổng `3000`. Đổi cổng: `PORT=8080 npm start` (PowerShell: `$env:PORT=8080; npm start`).

Xem log để biết máy đã lên:

```
http://localhost:3000/health
```

## Mở cho mạng công ty vào được

Cần cả 3 bước, thiếu một là không vào được:

1. **Router ở nhà**: mở port (mặc định `3000`) trỏ về IP máy tính — port forwarding.
2. **Windows Firewall**: cho phép Node.js qua mạng công cộng (Private/Public tùy mạng nhà bạn).
3. **Domain**: đã trỏ IP nhà bạn. Nếu chạy qua Cloudflare Tunnel thì không cần bước 1–2.

Sau khi cấu hình, **thử mở bằng 4G trước khi đến văn phòng**. Đây là bước hay bị bỏ sót nhất.

## Cách dùng ngày thi

| Máy | Mở gì |
|---|---|
| Máy cắm máy chiếu | `http://<domain>/host` |
| Điện thoại (tối đa 12 máy) | Mở `http://<domain>` — tự chuyển thẳng sang trang điện thoại |

Không có mã phòng, không có QR, không có trang chọn. **Server chỉ giữ đúng một phòng duy nhất** — ai mở `/play` là vào slot trống
cùng phòng đó, không tách theo URL, không tách theo mã. Muốn cho người mới vào giữa chừng thì cứ bảo họ mở domain là vào.

Trình tự:

1. Bật máy ở nhà → `npm start` → mở cửa sổ terminal, **không đóng**.
2. Máy chiếu mở `/host`, địa chỉ vào phòng hiện lên màn hình lớn.
3. Anh em mở domain trên điện thoại (tự vào trang điện thoại), gõ tên, vào phòng (tối đa 12 người).
4. Bấm **BẮT ĐẦU** → đếm ngược → đua.
5. Xong có bảng xếp hạng + quà theo tier + pháo hoa. Bấm **CHƠI LẠI** để đấu vòng tiếp (giữ nguyên người chơi).

Máy chiếu hiện 12 làn, chia **2 cột × 6 hàng**, vạch đích ở cuối mỗi làn. Trên từng làn có nhãn
trạng thái: **BỊ CHẶN** / **BỊ CHẬM** / **TĂNG TỐC** — cả phòng cùng thấy "ồ thằng kia bị chặn".

## Luật chơi

- Về đích khi đủ **400 cú chạm** (~1 phút nếu chạy 7–8 cái/giây).
- Máy chiếu bấm **BẮT ĐẦU** bất kể phòng có bao nhiêu người — kể cả 0 người (dùng để thử máy chiếu trước khi có ai vào).
- Điểm do **server tính**, điện thoại không tự gửi điểm được. Chạm trước lúc GO hoặc sau khi về đích đều bị bỏ qua.
- Tối đa 16 chạm/giây/người — chặn script, nhưng vẫn để người thật chạm thoải mái.

## Kỹ năng

Mỗi người có 3 kỹ năng, chỉ dùng được trong lúc đua (không dùng trước GO, không dùng sau khi về đích).

| Kỹ năng | Dùng cho | Hiệu ứng | Hồi lại |
|---|---|---|---|
| **CHẶN** | 1 người khác | Người đó **không chạy được** trong 2.5 giây | 22 giây |
| **CHẬM** | 1 người khác | Người đó chạy nhưng **cứ nhịp thứ hai mới được tính điểm**, trong 5 giây | 28 giây |
| **TĂNG TỐC** | Chính mình | **+60 điểm** (tương đương 24 cú chạm) | 25 giây |

Cách dùng trên điện thoại: bấm **CHẶN** / **CHẬM** → hiện lưới chọn đích → bấm tên người muốn nhắm.
**TĂNG TỐC** bấm là nổ ngay, không cần chọn đích. Bấm **CHẠY!** để đóng lưới chọn (tránh chọn nhầm khi đang bấm liên tục).
Khi bị nhắm, điện thoại hiện băng đỏ trượt xuống + rung máy.

### Chống lạm dụng

- **Hiệu ứng không cộng dồn**: đang bị chặn thì chặn tiếp không ăn, đang bị chậm thì chậm tiếp không ăn (và không kéo dài hiệu ứng cũ).
- Sau khi hết hiệu ứng, người đó **miễn nhiễm đúng loại đó 6 giây** → bị nhắm nhiều nhất cũng chỉ mất ~14 giây, trận không kéo quá 65 giây.
- Đang trong thời gian hồi lại thì bấm không được, và **không tốn hồi lại** nếu hiệu ứng không ăn (bị chặn rồi / đang miễn nhiễm / người đó đã về đích).

Mọi con số cân bằng nằm gọn trong hằng số `SKILLS` đầu `game.js` — sửa một dòng là xong cả game.
Sau khi chạy thử thấy loạn thì hãy tăng thời gian hồi lại hoặc giảm thời gian hiệu ứng.

## Qua theo tier

Không có vòng bốc thẻ. Kết thúc trận là hiện **bảng xếp hạng kèm quà luôn**, chia theo thứ hạng:

| Tier | Ai được | Số món |
|---|---|---|
| **Tier 1** | 3 người đứng đầu | 3 |
| **Tier 2** | 4 người kế tiếp | 4 |
| **Tier 3** | 5 người còn lại | 5 |

Mỗi người thấy mình ở tier nào và nhận món nào ngay trên điện thoại; máy chiếu hiện tier + tên món quà
của từng người trên bảng xếp hạng.

Món quà khai trong `data/gifts.json`, mỗi món có trường `tier` (1/2/3).
**Trong cùng tier, thứ tự trong file là thứ tự trao**: món đứng đầu file của tier trao cho người có hạng cao nhất trong tier đó.
Muốn đổi món nào cho ai thì sửa `data/gifts.json` — không cần sửa code.

## Cứu hộ

| Sự cố | Cách xử lý |
|---|---|
| `EADDRINUSE: port 3000` | Đã có server đang chạy. Kiểm tra bằng `curl http://localhost:3000/health` — nếu trả JSON thì server cũ vẫn ổn, cứ dùng. Muốn chạy lại thì đóng cửa sổ terminal cũ hoặc `taskkill /PID <pid> /F` |
| Có người kẹt / treo, không chạy nổi | Máy chiếu bấm **Đánh dấu về đích** — đánh hạng cho họ luôn |
| Điện thoại mất mạng giữa chừng | Người đó vẫn giữ được thành tích; vào lại `/play` là nhận đúng slot cũ |
| Máy chiếu bị văng ra | F5 là được, mọi thứ tựi đúng |
| Mất điện nhà giữa chừng | Phải đấu lại từ đầu. Nhớ sạc máy, không cho máy ngủ |
| `/host` báo "đã có máy chiếu khác" | Có tab host cũ còn mở. Đóng hết tab host, F5 lại |

## Kiểm tra trước khi dùng

```bash
npm test
```

71 test: logic game (điểm, chống spam, thứ tự về đích, 12 slot, 3 kỹ năng, chia quà theo tier, ghi ai gây hiệu ứng) + các vòng đua thật qua WebSocket.

## Cấu trúc

```
server.js         HTTP + WebSocket (một phòng duy nhất)
game.js           logic thuần của game (không I/O, có test)
test/             test logic + test tích hợp
data/gifts.json   12 món quà chia 3 tier, tự trao theo thứ hạng khi hết trận
public/           giao diện máy chiếu và điện thoại
```

## Ghi chú kỹ thuật

- Không có bước build. Sửa file `.js`/`.css` xong F5 là thấy. Server gửi header `no-store` nên không bị cache.
- Nhân vật pixel vẽ bằng SVG trong `public/js/pixel.js`, màu sinh từ tên — không cần tải asset ngoài, không lo mất mạng lúc chạy.
- Âm thanh tổng hợp bằng WebAudio, không có file nhạc nên không vướng bản quyền. Mỗi kỹ năng có âm riêng: CHẶN là tiếng "cụp" nặng, CHẬM là tiếng tụt tần số, TĂNG TỐC là tiếng quét lên.
- Hiệu ứng kỹ năng: điện thoại bị nhắm thì có lớp sáng đè (đỏ/ xanh) + nút CHẠY đổi trạng thái (mờ/rung khi bị chặn, nhòe khi bị chậm); máy chiếu thì làn người bị nhắm đổi màu, nhân vật đứng yên khi bị chặn và chạy chậm khi bị chậm.
- Cổng `3000` là HTTP thuần. Nếu domain của bạn là HTTPS thì trang dùng `wss://` — server này không tự chứng thực TLS, nên hãy đặt Cloudflare Tunnel hoặc reverse proxy HTTPS ở trước.