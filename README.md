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
   Nhân vật **đổi ngẫu nhiên mỗi lần gõ một ký tự**, chốt lại khi bấm vào phòng. Vào là thấy ngay màn hình đua, bấm **CHẠY** thoải mái để khởi động tay.
4. Bấm **BẮT ĐẦU** → mọi người về vạch xuất phát → đếm ngược → đua **tối đa 90 giây**.
5. Hết 90 giây (hoặc khi tất cả về đích) tự hiện bảng xếp hạng + pháo hoa. Bấm **CHƠI LẠI** để đấu vòng tiếp (giữ nguyên người chơi).

Máy chiếu chỉ có **một màn hình đua** dùng chung cho lúc chờ lẫn lúc thi: 12 làn cố định chia
**2 cột × 6 hàng**, người vào sau chỉ lấp vào làn trống nên bảng không bao giờ xếp lại giữa chừng.
Làn chưa có người hiện số thứ tự mờ. Trên từng làn có nhãn trạng thái: **BỊ CHẶN** / **BỊ CHẬM** /
**TĂNG TỐC** — cả phòng cùng thấy "ồ thằng kia bị chặn".

## Luật chơi

- Về đích khi đủ **400 cú chạm** (~1 phút nếu chạy 7–8 cái/giây).
- Mỗi trận kéo dài tối đa **90 giây**, máy chiếu và điện thoại đều có đồng hồ đếm ngược.
  Hết giờ server **tự kết thúc** — không cần bấm gì. Ai chưa về đích được xếp theo tiến độ đang có.
- Máy chiếu bấm **BẮT ĐẦU** bất kể phòng có bao nhiêu người — kể cả 0 người (dùng để thử máy chiếu trước khi có ai vào).
- Điểm do **server tính**, điện thoại không tự gửi điểm được. Chạm lúc đang chờ chỉ để khởi động
  tay: khi máy chiếu bấm **BẮT ĐẦU**, tất cả về 0. Chạm trong lúc đếm ngược và sau khi về đích đều bị bỏ qua.
- Tối đa 16 chạm/giây/người — chặn script, nhưng vẫn để người thật chạm thoải mái.

## Kỹ năng

Mỗi người có 3 kỹ năng, chỉ dùng được trong lúc đua (không dùng trước GO, không dùng sau khi về đích).

| Kỹ năng | Dùng cho | Hiệu ứng | Hồi lại |
|---|---|---|---|
| **CHẶN** | 1 người khác | Người đó **không chạy được** trong 2.5 giây | 22 giây |
| **CHẬM** | 1 người khác | Người đó chạy nhưng **cứ nhịp thứ hai mới được tính điểm**, trong 5 giây | 28 giây |
| **TĂNG TỐC** | Chính mình | **+60 điểm** (tương đương 24 cú chạm) | 25 giây |

Cách dùng trên điện thoại: bấm **CHẶN** / **CHẬM** → hiện danh sách người chơi **xếp theo thứ hạng hiện tại**
(kèm nhân vật, hạng, % tiến độ) → bấm người muốn nhắm. Danh sách tự sắp lại mỗi lần mở.
**TĂNG TỐC** bấm là nổ ngay, không cần chọn đích. Bấm **CHẠY!** để đóng danh sách (tránh chọn nhầm khi đang bấm liên tục).
Khi bị nhắm, điện thoại hiện băng đỏ trượt xuống + rung máy.

### Chống lạm dụng

- **Hiệu ứng không cộng dồn**: đang bị chặn thì chặn tiếp không ăn, đang bị chậm thì chậm tiếp không ăn (và không kéo dài hiệu ứng cũ).
- Sau khi hết hiệu ứng, người đó **miễn nhiễm đúng loại đó 6 giây** → bị nhắm nhiều nhất cũng chỉ mất ~14 giây, không đủ để làm hỏng cả trận 90 giây.
- Đang trong thời gian hồi lại thì bấm không được, và **không tốn hồi lại** nếu hiệu ứng không ăn (bị chặn rồi / đang miễn nhiễm / người đó đã về đích).

Mọi con số cân bằng nằm gọn trong hằng số `SKILLS` đầu `game.js` — sửa một dòng là xong cả game.
Sau khi chạy thử thấy loạn thì hãy tăng thời gian hồi lại hoặc giảm thời gian hiệu ứng.

## Trao quà

Game **không** chia quà và không hiện tên món quà ở đâu cả. Hết trận chỉ hiện **bảng xếp hạng**.

Quà do người tổ chức tự trao ngoài đời theo thứ hạng trên bảng. Cần danh sách món để đi mua thì xem
`data/gifts.json` — file đó chỉ là bảng ghi chú, không được nạp vào server.

## Cứu hộ

| Sự cố | Cách xử lý |
|---|---|
| `EADDRINUSE: port 3000` | Đã có server đang chạy. Kiểm tra bằng `curl http://localhost:3000/health` — nếu trả JSON thì server cũ vẫn ổn, cứ dùng. Muốn chạy lại thì đóng cửa sổ terminal cũ hoặc `taskkill /PID <pid> /F` |
| Có người kẹt / treo, không chạy nổi | Cứ để hết 90 giây — server tự xếp họ theo tiến độ, không cần thao tác |
| Điện thoại mất mạng giữa chừng | Người đó vẫn giữ được thành tích; vào lại `/play` là nhận đúng slot cũ |
| Máy chiếu bị văng ra | F5 là được, mọi thứ tựi đúng |
| Mất điện nhà giữa chừng | Phải đấu lại từ đầu. Nhớ sạc máy, không cho máy ngủ |
| `/host` báo "đã có máy chiếu khác" | Có tab host cũ còn mở. Đóng hết tab host, F5 lại |

## Kiểm tra trước khi dùng

```bash
npm test
```

78 test: logic game (điểm, chống spam, thứ tự về đích, giới hạn 90 giây, 12 slot, 3 kỹ năng, ghi ai gây hiệu ứng) + các vòng đua thật qua WebSocket.

## Cấu trúc

```
server.js         HTTP + WebSocket (một phòng duy nhất)
game.js           logic thuần của game (không I/O, có test)
test/             test logic + test tích hợp
data/gifts.json   ghi chú danh sách quà để đi mua, game không đọc file này
public/           giao diện máy chiếu và điện thoại
```

## Ghi chú kỹ thuật

- Không có bước build. Sửa file `.js`/`.css` xong F5 là thấy. Server gửi header `no-store` nên không bị cache.
- Nhân vật pixel lấy từ bộ "0x72 DungeonTileset II" của 0x72, giấy phép CC0 1.0 (dùng thương mại, không bắt buộc ghi công). 25 nhân vật, mỗi nhân vật 4 frame chạy; mỗi lần mở trang điện thoại, nhân vật được chọn ngẫu nhiên và giữ nguyên suốt ván. Ảnh nằm ở `public/img/cast/`, kèm `LICENSE-CC0.txt`. Không cần mạng khi chạy.
- Âm thanh tổng hợp bằng WebAudio, không có file nhạc nên không vướng bản quyền. Mỗi kỹ năng có âm riêng: CHẶN là tiếng "cụp" nặng, CHẬM là tiếng tụt tần số, TĂNG TỐC là tiếng quét lên.
- Hiệu ứng kỹ năng: điện thoại bị nhắm thì có lớp sáng đè (đỏ/ xanh) + nút CHẠY đổi trạng thái (mờ/rung khi bị chặn, nhòe khi bị chậm); máy chiếu thì làn người bị nhắm đổi màu, nhân vật đứng yên khi bị chặn và chạy chậm khi bị chậm.
- Cổng `3000` là HTTP thuần. Nếu domain của bạn là HTTPS thì trang dùng `wss://` — server này không tự chứng thực TLS, nên hãy đặt Cloudflare Tunnel hoặc reverse proxy HTTPS ở trước.
