import fetch from 'node-fetch';
import FormData from 'form-data';

// Nếu cần, bạn có thể tách service riêng để gọi API Stability, ví dụ:
// import { generateVideo } from '../services/stability.service.js';

export const imageToVideo = async (req, res) => {
  try {
    const { image_url, seed, cfg_scale, motion_bucket_id } = req.body;
    console.log("image_url", image_url)
    // Lấy dữ liệu ảnh từ URL
    const imageResponse = await fetch(image_url);
    const imageBuffer = await imageResponse.buffer();

    // Tạo đối tượng FormData
    const form = new FormData();
    form.append('image', imageBuffer, { filename: 'image.png' });
    form.append('seed', seed);
    form.append('cfg_scale', cfg_scale);
    form.append('motion_bucket_id', motion_bucket_id);

    console.log("form", form)
    // Gửi request đến API chuyển đổi image -> video
    const stabilityResponse = await fetch('https://api.stability.ai/v2beta/image-to-video', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    // Lấy phản hồi dưới dạng text trước
    const responseText = await stabilityResponse.text();
    console.error('Phản hồi từ Stability API:', responseText);

    // Sau đó, nếu bạn chắc chắn rằng phản hồi là JSON thì mới parse
    try {
      const result = JSON.parse(responseText);
      return res.json(result);
    } catch (err) {
      console.error('Lỗi parse JSON:', err);
      return res.status(500).json({ error: 'Không thể parse phản hồi từ Stability API. Kiểm tra log để biết thông tin chi tiết.' });
    }
  } catch (error) {
    console.error('[imageToVideo error]', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
