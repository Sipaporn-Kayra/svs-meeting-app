import streamlit as st
import json
import gspread
import pandas as pd
from datetime import datetime

# 1. ตั้งค่าหัวเว็บและปรับหน้าจอให้กว้างเป็นพิเศษ (Wide Layout) เหมาะสำหรับทำแดชบอร์ด
st.set_page_config(page_title="SVS Meeting Portal", page_icon="🩺", layout="wide")

st.title("🩺 ระบบจัดการประชุมและสวัสดิการ SVS")

# 2. ฟังก์ชันเชื่อมต่อ Google Sheets
@st.cache_resource
def init_connection():
    creds_json = st.secrets["google_credentials"]
    creds_dict = json.loads(creds_json)
    return gspread.service_account_from_dict(creds_dict)

try:
    gc = init_connection()
    sheet = gc.open("SVS_Database").sheet1 
except Exception as e:
    st.error(f"เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล: {e}")
    st.stop()

# 3. สร้างแท็บแบ่งหน้าต่างสลับหมวดหมู่
tab1, tab2 = st.tabs(["📝 ฟอร์มลงทะเบียน (User)", "📊 แดชบอร์ดแอดมิน (Admin)"])

# ==========================================
# แท็บที่ 1: ฟอร์มลงทะเบียน (โค้ดตัวเดิมของคุณ)
# ==========================================
with tab1:
    st.header("แบบฟอร์มลงทะเบียนเข้าร่วมประชุม")
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
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                if is_attending == "ไม่เข้าร่วม":
                    lunch, drink, sport, topic, time_needed = "-", "-", "-", "-", 0
                
                row_data = [timestamp, name, is_attending, lunch, drink, sport, topic, time_needed]
                sheet.append_row(row_data)
                st.success(f"บันทึกข้อมูลของ {name} เรียบร้อย! ข้อมูลในแดชบอร์ดจะอัปเดตอัตโนมัติ")
                st.balloons()

# ==========================================
# แท็บที่ 2: แดชบอร์ดแอดมิน (ฟีเจอร์ใหม่!)
# ==========================================
with tab2:
    st.header("📊 หน้าสรุปผลสำหรับผู้บริหารและแอดมิน")
    
    # ดึงข้อมูล Real-time ทั้งหมดจาก Google Sheets
    data = sheet.get_all_records()
    
    if not data:
        st.info("ยังไม่มีข้อมูลผู้ลงทะเบียนในระบบในขณะนี้")
    else:
        # แปลงข้อมูลดิบให้กลายเป็นตารางอัจฉริยะ (DataFrame)
        df = pd.DataFrame(data)
        
        # 📊 ส่วนที่ 2.1: การ์ดตัวเลขสรุป (Metrics)
        total_responses = len(df)
        attending_count = len(df[df['Attendance'] == 'เข้าร่วม'])
        not_attending_count = len(df[df['Attendance'] == 'ไม่เข้าร่วม'])
        
        metrics_col1, metrics_col2, metrics_col3 = st.columns(3)
        metrics_col1.metric("จำนวนผู้ตอบฟอร์มทั้งหมด", f"{total_responses} คน")
        metrics_col2.metric("ยอดผู้ยืนยันเข้าประชุม", f"{attending_count} คน", delta="Active", delta_color="normal")
        metrics_col3.metric("ยอดผู้ไม่เข้าร่วม", f"{not_attending_count} คน", delta="-", delta_color="inverse")
        
        st.divider()
        
        # กรองข้อมูลเฉพาะคนที่เลือก "เข้าร่วม" เพื่อเอามาคำนวณสวัสดิการครัวและกิจกรรม
        df_attending = df[df['Attendance'] == 'เข้าร่วม']
        
        if df_attending.empty:
            st.warning("⚠️ ยังไม่มีข้อมูลการจัดสรรสวัสดิการ เนื่องจากยังไม่มีใครกด 'เข้าร่วม' ประชุม")
        else:
            # 📈 ส่วนที่ 2.2: กราฟแท่งสรุปเสบียงอาหารและเครื่องดื่ม
            st.subheader("🍔 ยอดสรุปการสั่งอาหารและเครื่องดื่ม (ส่งให้ร้านค้าได้ทันที)")
            chart_col1, chart_col2 = st.columns(2)
            
            with chart_col1:
                st.write("**📊 ยอดรวมเมนูอาหารกลางวัน**")
                lunch_summary = df_attending['Lunch'].value_counts()
                st.bar_chart(lunch_summary, color="#FF4B4B") # สีแดงสดสไตล์ Streamlit
                
            with chart_col2:
                st.write("**📊 ยอดรวมเมนูเครื่องดื่ม**")
                drink_summary = df_attending['Drink'].value_counts()
                st.bar_chart(drink_summary, color="#00C0F2") # สีฟ้าสดใส
                
            st.divider()
            
            # 📅 ส่วนที่ 2.3: สรุปวาระการประชุมและเวลาที่ต้องใช้
            st.subheader("📅 รายการวาระประชุมที่ถูกเสนอ")
            # กรองแถวที่พิมพ์วาระเข้ามาจริงๆ (ไม่ว่างและไม่ใช่ขีด)
            df_topics = df_attending[(df_attending['Topic'] != "") & (df_attending['Topic'] != "-")]
            
            if df_topics.empty:
                st.info("รอบนี้ยังไม่มีผู้เสนอวาระเพิ่มเติมเข้ามา สามารถกระชับเวลาประชุมได้ครับ")
            else:
                total_minutes = df_topics['Time'].sum()
                st.warning(f"⏱️ **เวลาโดยประมาณที่ต้องใช้สำหรับวาระเสนอร่วม:** {total_minutes} นาที")
                # แสดงผลตารางเฉพาะคอลัมน์ที่แอดมินอยากเห็น
                st.dataframe(df_topics[['Name', 'Topic', 'Time']], use_container_width=True)
                
            st.divider()
            
        # 📋 ส่วนที่ 2.4: ตารางแสดงข้อมูลดิบทั้งหมด
        st.subheader("📋 ตารางรายชื่อและข้อมูลดิบทั้งหมด (Raw Data)")
        st.dataframe(df, use_container_width=True)
