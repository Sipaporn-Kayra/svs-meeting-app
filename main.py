import streamlit as st
import json
import gspread
import pandas as pd
from datetime import datetime
import google.generativeai as genai
from PIL import Image

# 1. ตั้งค่าหัวเว็บ
st.set_page_config(page_title="SVS Meeting Portal", page_icon="🩺", layout="wide")
st.title("🩺 ระบบจัดการประชุมและสวัสดิการ SVS")

# 2. ตั้งค่าการเชื่อมต่อ (Database & AI)
@st.cache_resource
def init_connections():
    creds_json = st.secrets["google_credentials"]
    creds_dict = json.loads(creds_json)
    gc = gspread.service_account_from_dict(creds_dict)
    
    genai.configure(api_key=st.secrets["gemini_api_key"])
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    return gc, model

try:
    gc, vision_model = init_connections()
    db = gc.open("SVS_Database")
    sheet_user = db.sheet1
    sheet_settings = db.worksheet("Settings")
except Exception as e:
    st.error(f"เกิดข้อผิดพลาดในการเชื่อมต่อระบบ: {e}")
    st.stop()

# 3. ดึงข้อมูลเมนูแบบไดนามิกจาก Settings
settings_data = sheet_settings.get_all_values()
if len(settings_data) > 1:
    df_settings = pd.DataFrame(settings_data[1:], columns=settings_data[0])
    lunch_options = [x for x in df_settings['Lunch'].tolist() if x != ""]
    drink_options = [x for x in df_settings['Drink'].tolist() if x != ""]
    sport_options = [x for x in df_settings['Sport'].tolist() if x != ""]
else:
    lunch_options, drink_options, sport_options = [], [], []

# State Management: สร้างความจำให้หน้าเว็บเพื่อพักข้อมูลที่ AI อ่านได้
if 'draft_lunch' not in st.session_state:
    st.session_state.draft_lunch = ",".join(lunch_options)
if 'draft_drink' not in st.session_state:
    st.session_state.draft_drink = ",".join(drink_options)

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
        
        st.subheader("2. สวัสดิการ (อัปเดตเมนูแบบไดนามิก)")
        lunch = st.multiselect("เมนูอาหารกลางวัน (เลือกได้มากกว่า 1 อย่าง)", lunch_options)
        
        st.markdown("---")
        st.write("**รายละเอียดเครื่องดื่ม**")
        drink_col1, drink_col2 = st.columns(2)
        with drink_col1:
            drink_base = st.selectbox("1. เมนูหลัก", drink_options)
            drink_roast = st.selectbox("3. เมล็ดกาแฟ (สำหรับเมนูกาแฟ)", ["ไม่ระบุ", "คั่วอ่อน", "คั่วกลาง", "คั่วเข้ม"])
        with drink_col2:
            drink_temp = st.selectbox("2. รูปแบบ", ["เย็น", "ร้อน", "ปั่น"])
            drink_sweet = st.selectbox("4. ระดับความหวาน", ["หวานปกติ (100%)", "หวานน้อย (50%)", "ไม่หวาน (0%)", "หวานมาก (120%)"])
        
        st.markdown("---")
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
                    lunch_str, final_drink_str, sport, topic, time_needed = "-", "-", "-", "-", 0
                else:
                    lunch_str = ", ".join(lunch) if len(lunch) > 0 else "ไม่ได้ระบุ"
                    roast_str = f", {drink_roast}" if drink_roast != "ไม่ระบุ" else ""
                    final_drink_str = f"{drink_base} ({drink_temp}{roast_str}, {drink_sweet})"
                
                row_data = [timestamp, name, is_attending, lunch_str, final_drink_str, sport, topic, time_needed]
                sheet_user.append_row(row_data)
                st.success("บันทึกข้อมูลเรียบร้อย!")
                st.balloons()

# ==========================================
# แท็บที่ 2: แดชบอร์ดแอดมิน + ระบบ AI Vision
# ==========================================
with tab2:
    st.header("📊 หน้าควบคุมและสรุปผลสำหรับแอดมิน")
    password_input = st.text_input("กรุณากรอกรหัสผ่าน Admin:", type="password")
    
    if password_input == st.secrets["admin_password"]:
        st.success("🔓 เข้าสู่ระบบหลังบ้านสำเร็จ")
        st.divider()
        
        # 🤖 ส่วนที่ 1: ระบบ AI อ่านรูปภาพเมนู
        st.subheader("🤖 ระบบ AI ช่วยอ่านเมนูอาหาร/เครื่องดื่มจากรูปภาพ")
        upload_col, ai_col = st.columns([1, 1])
        
        with upload_col:
            img_file = st.file_uploader("อัปโหลดไฟล์รูปเมนูร้านค้า (JPG, PNG, WEBP)", type=["jpg", "png", "jpeg", "webp"])
            menu_type = st.radio("รูปภาพนี้คือเมนูหมวดไหน?", ["อาหารกลางวัน", "เครื่องดื่ม"])
            
            if img_file is not None:
                image = Image.open(img_file)
                st.image(image, caption="ภาพเมนูที่อัปโหลด", use_column_width=True)
                
        with ai_col:
            st.info("💡 ข้อแนะนำ: เมื่อ AI อ่านเสร็จ ข้อความจะถูกนำไปวางในกล่องตั้งค่าด้านล่างอัตโนมัติ ให้คุณตรวจสอบความถูกต้องก่อนกดเปิดฟอร์ม")
            if img_file is not None and st.button("✨ ให้ AI สกัดรายชื่อเมนู", use_container_width=True):
                with st.spinner("AI กำลังวิเคราะห์รูปภาพ..."):
                    try:
                        ai_prompt = """
                        คุณคือผู้ช่วยแอดมิน กรุณาอ่านรูปภาพเมนูนี้และดึงเฉพาะ 'ชื่อเมนู' ออกมา 
                        ไม่ต้องเอา ราคา หรือ คำอธิบายเพิ่มเติม 
                        ส่งผลลัพธ์กลับมาเป็นข้อความบรรทัดเดียว คั่นด้วยเครื่องหมายจุลภาค (,) เท่านั้น 
                        เช่น: ข้าวผัดหมู, สุกี้น้ำ, กาแฟเย็น, ชาเขียว
                        """
                        response = vision_model.generate_content([ai_prompt, image])
                        result_text = response.text.strip()
                        
                        st.success("สกัดข้อความสำเร็จ!")
                        st.write("ผลลัพธ์จาก AI:", result_text)
                        
                        if menu_type == "อาหารกลางวัน":
                            if st.session_state.draft_lunch.strip() == "":
                                st.session_state.draft_lunch = result_text
                            else:
                                st.session_state.draft_lunch += f", {result_text}"
                        else:
                            if st.session_state.draft_drink.strip() == "":
                                st.session_state.draft_drink = result_text
                            else:
                                st.session_state.draft_drink += f", {result_text}"
                                
                        st.rerun() 
                        
                    except Exception as e:
                        st.error(f"เกิดข้อผิดพลาดจาก AI: {e}")
        
        st.divider()
        
        # ⚙️ ส่วนที่ 2: กล่องตรวจสอบและเปิดฟอร์ม
        st.subheader("⚙️ ตรวจสอบและตั้งค่าสวัสดิการประจำรอบ (คั่นด้วยเครื่องหมาย ,)")
        config_col1, config_col2, config_col3 = st.columns(3)
        
        with config_col1:
            new_lunch_str = st.text_area("รายการอาหารกลางวัน", value=st.session_state.draft_lunch)
        with config_col2:
            new_drink_str = st.text_area("รายการเครื่องดื่ม", value=st.session_state.draft_drink)
        with config_col3:
            new_sport_str = st.text_area("รายการกิจกรรมกีฬา", value=",".join(sport_options))
            
        if st.button("💾 Save & Publish เปิดฟอร์มรอบใหม่"):
            # Data Deduplication: ใช้ dict.fromkeys ตัดคำซ้ำและรักษาลำดับ
            list_lunch = list(dict.fromkeys([x.strip() for x in new_lunch_str.split(",") if x.strip() != ""]))
            list_drink = list(dict.fromkeys([x.strip() for x in new_drink_str.split(",") if x.strip() != ""]))
            list_sport = list(dict.fromkeys([x.strip() for x in new_sport_str.split(",") if x.strip() != ""]))
            
            max_len = max(len(list_lunch), len(list_drink), len(list_sport))
            list_lunch += [""] * (max_len - len(list_lunch))
            list_drink += [""] * (max_len - len(list_drink))
            list_sport += [""] * (max_len - len(list_sport))
            
            sheet_settings.clear()
            sheet_settings.append_row(["Lunch", "Drink", "Sport"])
            for i in range(max_len):
                sheet_settings.append_row([list_lunch[i], list_drink[i], list_sport[i]])
                
            st.success("🎉 อัปเดตรายการสวัสดิการสำเร็จ!")
            
            st.session_state.draft_lunch = ",".join([x for x in list_lunch if x != ""])
            st.session_state.draft_drink = ",".join([x for x in list_drink if x != ""])
            st.rerun()
            
        st.divider()
        
        # --- กราฟและข้อมูลดิบ ---
        data = sheet_user.get_all_records()
        if data:
            df = pd.DataFrame(data)
            st.subheader("🍔 ยอดสรุปการสั่งอาหารและเครื่องดื่ม")
            
            df_attending = df[df['Attendance'] == 'เข้าร่วม']
            if not df_attending.empty:
                chart_col1, chart_col2 = st.columns(2)
                with chart_col1:
                    lunch_series = df_attending['Lunch'].str.split(', ').explode()
                    lunch_series = lunch_series[~lunch_series.isin(["ไม่ได้ระบุ", "-"])]
                    st.bar_chart(lunch_series.value_counts(), color="#FF4B4B")
                with chart_col2:
                    st.bar_chart(df_attending['Drink'].value_counts(), color="#00C0F2")
                    
            st.subheader("📋 ตารางรายชื่อและข้อมูลดิบทั้งหมด (Raw Data)")
            st.dataframe(df, use_container_width=True)
    else:
        if password_input != "":
            st.error("❌ รหัสผ่านไม่ถูกต้อง!")
    # ==========================================
            # 🧠 AI Scheduling Engine (ระบบจัดตารางประชุมอัจฉริยะ)
            # ==========================================
            st.divider()
            st.header("🧠 AI Scheduling Engine (ระบบจัดตารางประชุมอัจฉริยะ)")
            
            # 1. กรองเฉพาะผู้เข้าร่วมที่มีการเสนอวาระ (Topic ไม่เป็นช่องว่าง และ ไม่ใช่ "-")
            df_agenda = df_attending[(df_attending['Topic'] != "") & (df_attending['Topic'] != "-")].copy()
            
            if df_agenda.empty:
                st.info("📌 ยังไม่มีวาระการประชุมที่ถูกเสนอเข้ามาในรอบนี้ครับ")
            else:
                # 2. คำนวณเวลารวมที่ต้องใช้ทั้งหมด
                total_requested_time = int(df_agenda['Time'].sum())
                quota_time = 375 # โควตาตาม Brief C.L.E.A.R
                
                st.write(f"⏱️ **เวลาที่ต้องการใช้ทั้งหมด:** {total_requested_time} นาที / โควตาจัดสรร: {quota_time} นาที")
                
                # 3. Business Logic: ตรวจสอบ Edge Cases
                if total_requested_time > quota_time:
                    st.error(f"⚠️ เวลาเกินโควตาไป {total_requested_time - quota_time} นาที (Over Time)")
                    st.warning("**💡 ข้อเสนอแนะจากระบบ (Action Required):**\n1. ลดเวลาทุกวาระลง 10%\n2. ย้ายวาระสำคัญน้อยไปรอบหน้า\n3. ปรับเป็น Pre-read ให้ Q&A อย่างเดียว\n4. ปรับแก้ตามดุลพินิจ Admin")
                elif total_requested_time < quota_time:
                    st.success(f"✅ เวลาอยู่ในโควตา (เหลือเวลา {quota_time - total_requested_time} นาที)")
                    st.info("**💡 ข้อเสนอแนะจากระบบ (Under Time):**\n1. เพิ่มเวลา Q&A ท้ายการประชุม\n2. เลื่อนเวลาเลิกและขยับเวลากีฬาให้เร็วขึ้น")
                else:
                    st.success("✅ เวลาพอดีโควตาเป๊ะ!")

                # 4. เตรียมข้อมูล (Data Preparation) ให้ AI
                agenda_list_str = ""
                for index, row in df_agenda.iterrows():
                    agenda_list_str += f"- หัวข้อ: {row['Topic']} (ผู้นำเสนอ: {row['Name']}, เวลาที่ใช้: {row['Time']} นาที)\n"
                    
                # 5. ปุ่ม Trigger AI
                if st.button("🪄 Generate Schedule by AI (ร่างตารางประชุมอัตโนมัติ)", use_container_width=True):
                    with st.spinner("🧠 AI กำลังคำนวณการจัดเรียงวาระ และหาจุดแทรกเวลาพักเบรก..."):
                        try:
                            # Prompt Engineering ที่ระบุกฎอย่างชัดเจน (Hard & Soft Constraints)
                            prompt = f"""
                            คุณคือผู้เชี่ยวชาญด้านการจัดตารางประชุม (Meeting Scheduler)
                            หน้าที่ของคุณคือ นำรายการวาระต่อไปนี้ไปจัดเรียงเป็นตารางเวลาให้สมบูรณ์
                            
                            รายการวาระที่ต้องจัดสรร:
                            {agenda_list_str}
                            
                            กฎและข้อยกเว้นบังคับ (Rules):
                            1. โครงสร้างหลัก: 
                                - 08.00 - 08.45 น. : วาระคงที่ (เปิดงาน/แจ้งสถานการณ์)
                                - 12.00 - 13.00 น. : พักรับประทานอาหารกลางวัน
                                - 16.30 - 17.00 น. : วาระคงที่ (สรุปงาน/ปิดการประชุม)
                            2. การพักเบรก (สำคัญมาก): ต้องแทรกเวลา 'พักเบรก 15 นาที' จำนวน 2 ครั้ง คือช่วงเช้า 1 ครั้ง และช่วงบ่าย 1 ครั้ง โดยพยายามหาจุดเชื่อมต่อวาระที่ใกล้เคียงกึ่งกลางของช่วงเช้าและบ่ายที่สุด
                            3. กฎเหล็ก: "ห้ามแทรกพักเบรกตัดกลางเวลาของวาระใดๆ โดยเด็ดขาด" ต้องให้จบวาระนั้นๆ ก่อนถึงจะพักเบรกได้
                            
                            ข้อกำหนดการแสดงผล:
                            แสดงผลเป็นตาราง Markdown ที่มีคอลัมน์: [เวลา, กิจกรรม/หัวข้อ, ผู้นำเสนอ, ระยะเวลา]
                            ไม่ต้องเขียนคำอธิบายยืดยาว ขอแค่ตารางที่ดูเป็นมืออาชีพและนำไปใช้งานต่อได้ทันที
                            """
                            
                            # ส่งคำสั่งให้ Gemini 2.5 Flash ช่วยคิด
                            response = vision_model.generate_content(prompt)
                            
                            st.markdown("### 📅 ร่างตารางการประชุม (Draft Schedule)")
                            st.markdown(response.text)
                            
                            st.success("🎉 AI สร้างตารางประชุมเสร็จสิ้น! คุณสามารถคัดลอกตารางนี้ไปใช้งานได้เลย")
                            
                        except Exception as e:
                            st.error(f"เกิดข้อผิดพลาดในการประมวลผลของ AI: {e}")
