import streamlit as st

# 1. ตั้งค่าหัวเว็บ
st.set_page_config(page_title="SVS Meeting Portal", page_icon="🩺")

st.title("🩺 ลงทะเบียนประชุมและสวัสดิการ SVS")
st.write("กรุณากรอกข้อมูลเพื่อเตรียมความพร้อมสำหรับการประชุมรอบถัดไป")

# 2. ใช้ st.form เพื่อสร้างฟอร์มจัดกลุ่มข้อมูล
with st.form("register_form"):
    st.subheader("1. ข้อมูลส่วนตัว")
    name = st.text_input("ชื่อ-นามสกุล")
    is_attending = st.radio("สถานะการเข้าร่วม", ["เข้าร่วม", "ไม่เข้าร่วม"])
    
    st.subheader("2. สวัสดิการ (สำหรับผู้เข้าร่วม)")
    # Note: ตอนนี้เราใส่เป็น Hardcode (พิมพ์ข้อมูลตายตัว) ไว้ก่อน 
    # เดี๋ยวระบบจริงเราจะให้ AI อ่านจากรูปเมนูแล้วมาแทนที่ตรงนี้ครับ
    lunch = st.selectbox("เมนูอาหารกลางวัน", ["กะเพราไก่ไข่ดาว", "ผัดไทยกุ้งสด", "ข้าวหมูแดง"])
    drink = st.selectbox("เครื่องดื่ม", ["กาแฟเย็น", "ชาเขียวมัทฉะ", "น้ำส้มคั้น"])
    sport = st.selectbox("กิจกรรมกีฬาช่วงเย็น", ["ฟุตซอล", "แบดมินตัน", "ไม่เข้าร่วม"])
    
    st.subheader("3. วาระการประชุม (ถ้ามี)")
    topic = st.text_input("หัวข้อที่ต้องการเสนอ (เว้นว่างได้หากไม่มีวาระ)")
    time_needed = st.number_input("เวลาที่ใช้ประเมิน (นาที)", min_value=0, max_value=60, value=0)
    
    # 3. ปุ่มส่งข้อมูล
    submitted = st.form_submit_button("ส่งข้อมูลลงทะเบียน")
    
    # 4. Logic ตรวจสอบเมื่อกดปุ่ม Submit
    if submitted:
        if name == "":
            st.error("กรุณากรอกชื่อ-นามสกุลครับ!")
        else:
            st.success(f"ระบบจำลองการรับข้อมูลของ {name} เรียบร้อยแล้ว!")
            st.info(f"คุณเลือก: {lunch}, {drink} และเสนอกิจกรรม {time_needed} นาที")
