import streamlit as st

# 1. ตั้งค่าหัวเว็บ
st.set_page_config(page_title="SVS Meeting", page_icon="🩺")

# 2. แสดงหัวข้อและข้อความ
st.title("🩺 ระบบจัดการประชุม SVS")
st.write("สวัสดี! นี่คือเว็บแอปพลิเคชันแรกของฉันที่สร้างด้วย Python และ Streamlit")

# 3. ทดลองสร้างกล่องรับข้อมูลแบบง่ายๆ
name = st.text_input("กรุณากรอกชื่อของคุณ:")

# 4. ใช้ Logic พื้นฐาน 
if name:
    st.success(f"ยินดีต้อนรับคุณหมอ {name} เข้าสู่ระบบครับ!")
else:
    st.info("ระบบพร้อมใช้งาน รอรับข้อมูล...")
