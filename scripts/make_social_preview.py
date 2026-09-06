import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_minimal_social_preview():
    W, H = 1280, 640
    
    # 1. Ultra-clean deep dark canvas (#090D16)
    canvas = Image.new("RGBA", (W, H), (9, 13, 22, 255))
    
    # 2. Very subtle, smooth ambient glow directly behind the center mascot
    glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow_layer)
    cx, cy = W // 2, 245
    
    # Soft deep indigo/cyan radial halo (diffuse and understated)
    for r in range(340, 0, -8):
        alpha = int(26 * (1 - r / 340) ** 2)
        gdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(56, 189, 248, alpha))
    for r in range(190, 0, -6):
        alpha = int(32 * (1 - r / 190) ** 1.6)
        gdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(99, 102, 241, alpha))
        
    canvas = Image.alpha_composite(canvas, glow_layer)
    draw = ImageDraw.Draw(canvas)
    
    # 3. Fonts
    win_dir = os.environ.get("WINDIR", "C:\\Windows")
    font_bold_path = os.path.join(win_dir, "Fonts", "segoeuib.ttf")
    font_reg_path = os.path.join(win_dir, "Fonts", "segoeui.ttf")
    
    f_title = ImageFont.truetype(font_bold_path, 66)
    f_sub = ImageFont.truetype(font_reg_path, 21)
    
    # 4. Astro-Orb Mascot in Center (Mathematically vertically centered block)
    logo_path = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")
    if os.path.exists(logo_path):
        mascot_size = 160
        mx = (W - mascot_size) // 2
        my = 165
        
        # Mascot image
        mascot_raw = Image.open(logo_path).convert("RGBA")
        mascot_raw = mascot_raw.resize((mascot_size, mascot_size), Image.Resampling.LANCZOS)
        
        # Rounded mask (squircle style)
        radius = 40
        mask = Image.new("L", (mascot_size, mascot_size), 0)
        m_draw = ImageDraw.Draw(mask)
        m_draw.rounded_rectangle([0, 0, mascot_size, mascot_size], radius=radius, fill=255)
        
        # Soft ambient drop shadow under mascot
        m_shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ms_draw = ImageDraw.Draw(m_shadow)
        ms_draw.rounded_rectangle([mx - 4, my + 8, mx + mascot_size + 4, my + mascot_size + 22], radius=radius, fill=(0, 0, 0, 180))
        m_shadow = m_shadow.filter(ImageFilter.GaussianBlur(16))
        canvas = Image.alpha_composite(canvas, m_shadow)
        
        # Paste mascot
        canvas.paste(mascot_raw, (mx, my), mask)
        
        # Subtle crisp border
        m_border = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        mb_draw = ImageDraw.Draw(m_border)
        mb_draw.rounded_rectangle([mx, my, mx + mascot_size, my + mascot_size], radius=radius, outline=(255, 255, 255, 45), width=1)
        canvas = Image.alpha_composite(canvas, m_border)
        draw = ImageDraw.Draw(canvas)
        
    # 5. Title: GravityDesk (Centered)
    title_text = "GravityDesk"
    t_box = f_title.getbbox(title_text)
    tw = t_box[2] - t_box[0]
    tx = (W - tw) // 2
    ty = 358
    
    # Crisp subtle drop shadow for depth
    draw.text((tx, ty + 2), title_text, font=f_title, fill=(0, 0, 0, 180))
    draw.text((tx, ty), title_text, font=f_title, fill=(255, 255, 255, 255))
    
    # 6. Subtitle (Centered, minimal, single line)
    sub_text = "Self-Hosted Remote Control & Telemetry for Google Antigravity CLI"
    s_box = f_sub.getbbox(sub_text)
    sw = s_box[2] - s_box[0]
    sx = (W - sw) // 2
    sy = 448
    draw.text((sx, sy), sub_text, font=f_sub, fill=(148, 163, 184, 255))
    
    # 8. Save
    out_path = os.path.join(os.path.dirname(__file__), "..", "assets", "social-preview.png")
    canvas.save(out_path, format="PNG", optimize=True)
    print(f"Minimal social preview saved at: {out_path} ({W}x{H} px)")

if __name__ == "__main__":
    create_minimal_social_preview()
