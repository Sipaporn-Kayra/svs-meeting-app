import streamlit as st
import json
import gspread
import pandas as pd
from datetime import datetime

# 1. ตั้งค่าหัวเว็บ
st.set_page_config(page_title="SVS Meeting Portal", page_icon="🩺", layout="wide")

st.title("🩺 ระบบจัดการประชุมและสวัสดิการ SVS")

# 2. ฟังก์ชันเชื่อมต่อ Google Sheets แบบเปิดใช้งานทุกแท็บ
@st.cache_resource
def init_connection():
    creds_json = st.secrets["google_credentials"]
    creds_dict = json.loads(creds_json)
    return gspread.service_account_from_dict(creds_dict)

try:
    gc = init_connection()
    # เปิดไฟล์ฐานข้อมูลหลัก
    db = gc.open("SVS_Database")
    sheet_user = db.sheet1 # แท็บแรกสำหรับเก็บข้อมูลผู้ลงทะเบียน
    sheet_settings = db.worksheet("Settings") # แท็บสองสำหรับเก็บเมนูตั้งค่า
except Exception as e:
    st.error(f"เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล: {e}")
    st.stop()

# 3. ดึงข้อมูลเมนูแบบไดนามิกจากแท็บ Settings มาใช้งาน
settings_data = sheet_settings.get_all_values()
if len(settings_data) > 1:
    df_settings = pd.DataFrame(settings_data[1:], columns=settings_data[0])
    lunch_options = [x for x in df_settings['Lunch'].tolist() if x != ""]
    drink_options = [x for x in df_settings['Drink'].tolist() if x != ""]
    sport_options = [x for x in df_settings['Sport'].tolist() if x != ""]
else:
    # ค่า Fallback เผื่อตารางใน Sheets ว่างเปล่าระบบจะได้ไม่พัง
    lunch_options = ["กะเพราไก่ไข่ดาว"]
    drink_options = ["กาแฟเย็น"]
    sport_options = ["ไม่เข้าร่วม"]

# 4. สร้างแท็บสลับหน้าต่าง
tab1, tab2 = st.tabs(["📝 ฟอร์มลงทะเบียน (User)", "📊 แดชบอร์ดแอดมิน (Admin)"])

# ==========================================
# แท็บที่ 1: ฟอร์มลงทะเบียน (User Portal)
# ==========================================
with tab1:
    st.header("แบบฟอร์มลงทะเบียนเข้าร่วมประชุม")
    with st.form("register_form"):
        st.subheader("1. ข้อมูลส่วนตัว")
        name = st.text_input("ชื่อ-นามสกุล")
        is_attending = st.radio("สถานะการเข้าร่วม", ["เข้าร่วม", "ไม่เข้าร่วม"])
        
        st.subheader("2. สวัสดิการ (ข้อมูลอัปเดตแบบไดนามิกแล้ว)")
        lunch = st.selectbox("เมนูอาหารกลางวัน", lunch_options)
        drink = st.selectbox("เครื่องดื่ม", drink_options)
        sport = st.selectbox("กิจกรรมกีฬาช่วงเย็น", sport_options)
        
        st.subheader("3. วาระการประชุม (ถ้ามี)")
        topic = st.text_input("หัวข้อที่ต้องการเสนอ (เว้นว่างได้หากไม่มีวาระ)")
        time_needed = st.number_input("เวลาที่ใช้ประเมิน (นาที)", min_value=0, max_value=60, value=0)
        
        submitted = st.form_submit_button("ส่งข้อมูลลงทะเบียน")
        
        if submitted:
            if name == "":
                st.error("กรุณากรอกชื่อ-นามสกุลด้วยครับ!")
            else:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                if is_attending == "ไม่เข้าร่วม":
                    lunch, drink, sport, topic, time_needed = "-", "-", "-", "-", 0
                
                row_data = [timestamp, name, is_attending, lunch, drink, sport, topic, time_needed]
                sheet_user.append_row(row_data)
                st.success(f"บันทึกข้อมูลของ {name} เรียบร้อย!")
                st.balloons()

# ==========================================
# แท็บที่ 2: แดชบอร์ดแอดมิน + ประตูความปลอดภัย
# ==========================================
with tab2:
    st.header("📊 หน้าควบคุมและสรุปผลสำหรับแอดมิน")
    
    password_input = st.text_input("กรุณากรอกรหัสผ่าน Admin เพื่อเข้าสู่ระบบหลังบ้าน:", type="password")
    
    if password_input != st.secrets["admin_password"]:
        if password_input != "":
            st.error("❌ รหัสผ่านไม่ถูกต้อง! กรุณาลองใหม่อีกครั้ง")
        st.warning("🔒 เนื้อหาถูกล็อกไว้ เฉพาะแอดมินที่มีสิทธิ์เท่านั้นที่สามารถเข้าถึงได้")
    else:
        st.success("🔓 ยินดีต้อนรับ Admin เข้าสู่ระบบสำเร็จ!")
        st.divider()
        
        # ⚙️ เมนูตั้งค่าการประชุมรอบใหม่
        st.subheader("⚙️ เมนูตั้งค่าสวัสดิการประจำรอบการประชุม (พิมพ์คั่นด้วยเครื่องหมายจุลภาค ,)")
        config_col1, config_col2, config_col3 = st.columns(3)
        
        with config_col1:
            new_lunch_str = st.text_area("รายการอาหารกลางวัน", value=",".join(lunch_options))
        with config_col2:
            new_drink_str = st.text_area("รายการเครื่องดื่ม", value=",".join(drink_options))
        with config_col3:
            new_sport_str = st.text_area("รายการกิจกรรมกีฬา", value=",".join(sport_options))
            
        if st.button("💾 Save & Publish เปิดฟอร์มรอบใหม่"):
            list_lunch = [x.strip() for x in new_lunch_str.split(",") if x.strip() != ""]
            list_drink = [x.strip() for x in new_drink_str.split(",") if x.strip() != ""]
            list_sport = [x.strip() for x in new_sport_str.split(",") if x.strip() != ""]
            
            max_len = max(len(list_lunch), len(list_drink), len(list_sport))
            list_lunch += [""] * (max_len - len(list_lunch))
            list_drink += [""] * (max_len - len(list_drink))
            list_sport += [""] * (max_len - len(list_sport))
            
            sheet_settings.clear()
            sheet_settings.append_row(["Lunch", "Drink", "Sport"])
            for i in range(max_len):
                sheet_settings.append_row([list_lunch[i], list_drink[i], list_sport[i]])
                
            st.success("🎉 อัปเดตรายการสวัสดิการสำเร็จ! หน้าฟอร์ม User เปลี่ยนแปลงทันที")
            st.toast("ข้อมูลถูกบันทึกลง Google Sheets เรียบร้อยแล้ว")
            st.rerun()
            
        st.divider()
        
        # --- ส่วนแสดงผลแดชบอร์ด (แก้ Bug ชื่อตัวแปรเรียบร้อยแล้ว!) ---
        data = sheet_user.get_all_records() # <--- เปลี่ยนเป็น sheet_user ตรงนี้ครับ
        if not data:
            st.info("ยังไม่มีข้อมูลผู้ลงทะเบียนในระบบในขณะนี้")
        else:
            df = pd.DataFrame(data)
            total_responses = len(df)
            attending_count = len(df[df['Attendance'] == 'เข้าร่วม'])
            not_attending_count = len(df[df['Attendance'] == 'ไม่เข้าร่วม'])
            
            metrics_col1, metrics_col2, metrics_col3 = st.columns(3)
            metrics_col1.metric("จำนวนผู้ตอบฟอร์มทั้งหมด", f"{total_responses} คน")
            metrics_col2.metric("ยอดผู้ยืนยันเข้าประชุม", f"{attending_count} คน")
            metrics_col3.metric("ยอดผู้ไม่เข้าร่วม", f"{not_attending_count} คน")
            
            st.divider()
            
            df_attending = df[df['Attendance'] == 'เข้าร่วม']
            if not df_attending.empty:
                st.subheader("🍔 ยอดสรุปการสั่งอาหารและเครื่องดื่ม")
                chart_col1, chart_col2 = st.columns(2)
                with chart_col1:
                    st.write("**📊 ยอดรวมเมนูอาหารกลางวัน**")
                    st.bar_chart(df_attending['Lunch'].value_counts(), color="#FF4B4B")
                with chart_col2:
                    st.write("**📊 ยอดรวมเมนูเครื่องดื่ม**")
                    st.bar_chart(df_attending['Drink'].value_counts(), color="#00C0F2")
                    
                st.divider()
                st.subheader("📋 ตารางรายชื่อและข้อมูลดิบทั้งหมด (Raw Data)")
                st.dataframe(df, use_container_width=True)
