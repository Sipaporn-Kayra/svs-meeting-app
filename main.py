import streamlit as st
import json
import gspread
from datetime import datetime

# 1. ตั้งค่าหัวเว็บ
st.set_page_config(page_title="SVS Meeting Portal", page_icon="🩺")
st.title("🩺 ลงทะเบียนประชุมและสวัสดิการ SVS")

# 2. ฟังก์ชันเชื่อมต่อ Google Sheets
# 🎓 Mentor Note: @st.cache_resource ช่วยจำการเชื่อมต่อไว้ จะได้ไม่ต้องต่อเน็ตใหม่ทุกครั้งที่กดปุ่ม
@st.cache_resource
def init_connection():
    # ดึงกุญแจจากตู้เซฟ Secrets ที่เราซ่อนไว้
    creds_json = st.secrets["google_credentials"]
    creds_dict = json.loads(creds_json)
    # ใช้ gspread เชื่อมต่อด้วยกุญแจนั้น
    return gspread.service_account_from_dict(creds_dict)

try:
    gc = init_connection()
    # เปิดไฟล์ Sheets ตามชื่อที่ตั้งไว้เป๊ะๆ (ถ้าตั้งชื่ออื่น ต้องแก้ตรงนี้นะครับ)
    sheet = gc.open("SVS_Database").sheet1 
except Exception as e:
    st.error(f"เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล: {e}")
    st.stop() # หยุดการทำงานถ้าระบบต่อ Database ไม่ติด

# 3. สร้างฟอร์ม
with st.form("register_form"):
    st.subheader("1. ข้อมูลส่วนตัว")
    name = st.text_input("ชื่อ-นามสกุล")
    is_attending = st.radio("สถานะการเข้าร่วม", ["เข้าร่วม", "ไม่เข้าร่วม"])
    
    st.subheader("2. สวัสดิการ (สำหรับผู้เข้าร่วม)")
    lunch = st.selectbox("เมนูอาหารกลางวัน", ["กะเพราไก่ไข่ดาว", "ผัดไทยกุ้งสด", "ข้าวหมูแดง"])
    drink = st.selectbox("เครื่องดื่ม", ["กาแฟเย็น", "ชาเขียวมัทฉะ", "น้ำส้มคั้น"])
    sport = st.selectbox("กิจกรรมกีฬาช่วงเย็น", ["ฟุตซอล", "แบดมินตัน", "ไม่เข้าร่วม"])
    
    st.subheader("3. วาระการประชุม (ถ้ามี)")
    topic = st.text_input("หัวข้อที่ต้องการเสนอ (เว้นว่างได้หากไม่มีวาระ)")
    time_needed = st.number_input("เวลาที่ใช้ประเมิน (นาที)", min_value=0, max_value=60, value=0)
    
    submitted = st.form_submit_button("ส่งข้อมูลลงทะเบียน")
    
    if submitted:
        if name == "":
            st.error("กรุณากรอกชื่อ-นามสกุลด้วยครับ!")
        else:
            # 4. บันทึกข้อมูลลง Google Sheets
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # Logic: ถ้าเลือก "ไม่เข้าร่วม" ให้เคลียร์ข้อมูลสวัสดิการเป็นขีด (-)
            if is_attending == "ไม่เข้าร่วม":
                lunch, drink, sport, topic, time_needed = "-", "-", "-", "-", 0
            
            # เตรียมข้อมูล 1 แถว (ลำดับต้องตรงกับคอลัมน์ A-H ใน Sheets)
            row_data = [timestamp, name, is_attending, lunch, drink, sport, topic, time_needed]
            
            # สั่งหุ่นยนต์เติมข้อมูลลงแถวล่างสุดของตาราง
            sheet.append_row(row_data)
            
            st.success(f"บันทึกข้อมูลของ {name} ลงฐานข้อมูลสำเร็จแล้ว! ขอบคุณครับ")
            st.balloons() # เพิ่มเอฟเฟกต์ลูกโป่งฉลองความสำเร็จ!
