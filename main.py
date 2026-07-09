import streamlit as st
import json
import gspread
import pandas as pd
from datetime import datetime, timedelta
import google.generativeai as genai
from PIL import Image
import io

# 1. ตั้งค่าหัวเว็บและปรับหน้าจอกว้าง
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

# 3. ดึงข้อมูลเมนูแบบไดนามิกจาก Settings และเพิ่มระบบความหวานอัจฉริยะ
settings_data = sheet_settings.get_all_values()
if len(settings_data) > 1:
    df_settings = pd.DataFrame(settings_data[1:], columns=settings_data[0])
    lunch_options = [x for x in df_settings['Lunch'].tolist() if x != ""]
    drink_options = [x for x in df_settings['Drink'].tolist() if x != ""]
    sport_options = [x for x in df_settings['Sport'].tolist() if x != ""]
    
    # 🔗 ระบบ Backward Compatibility ป้องกันตารางพังหากคอลัมน์ Sweetness ยังไม่ถูกสร้าง
    if 'Sweetness' in df_settings.columns:
        sweet_options = [x for x in df_settings['Sweetness'].tolist() if x != ""]
    else:
        sweet_options = ["หวานปกติ (100%)", "หวานน้อย (50%)", "ไม่หวาน (0%)", "หวานมาก (120%)"]
else:
    lunch_options, drink_options, sport_options = [], [], []
    sweet_options = ["หวานปกติ (100%)", "หวานน้อย (50%)", "ไม่หวาน (0%)", "หวานมาก (120%)"]

if 'draft_lunch' not in st.session_state:
    st.session_state.draft_lunch = ",".join(lunch_options)
if 'draft_drink' not in st.session_state:
    st.session_state.draft_drink = ",".join(drink_options)

# 🕒 ฟังก์ชันอัจฉริยะ: ปรับ Signature รับค่าฐานเวลามาคำนวณแบบระบุตัวแปรชัดเจน (Robust Scope)
def recalculate_schedule_times(df, base_start_dt):
    df_clean = df.copy()
    
    if 'Order' in df_clean.columns:
        try:
            df_clean['Order'] = pd.to_numeric(df_clean['Order'], errors='coerce').fillna(999)
            df_clean = df_clean.sort_values(by='Order').reset_index(drop=True)
        except:
            pass
            
    try:
        current_time = base_start_dt 
        
        for idx, row in df_clean.iterrows():
            topic_str = str(row.get('Topic', '')).strip()
            
            if "พักรับประทานอาหารกลางวัน" in topic_str or "พักเที่ยง" in topic_str:
                lunch_time = current_time.replace(hour=12, minute=0, second=0, microsecond=0)
                if current_time < lunch_time:
                    current_time = lunch_time
            elif "สรุปงาน" in topic_str or "ปิดการประชุม" in topic_str:
                closing_time = current_time.replace(hour=16, minute=30, second=0, microsecond=0)
                if current_time < closing_time:
                    current_time = closing_time
            
            start_str = current_time.strftime("%H.%M")
            
            try:
                duration = int(float(row.get('Duration', 0)))
            except:
                duration = 0
                
            end_time = current_time + timedelta(minutes=duration)
            end_str = end_time.strftime("%H.%M")
            
            df_clean.at[idx, 'Time'] = f"{start_str}-{end_str}"
            current_time = end_time
            
        if 'Order' in df_clean.columns:
            df_clean['Order'] = [float(i) for i in range(1, len(df_clean) + 1)]
            
    except Exception as e:
        pass
    return df_clean

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
            # 👍 ดึงข้อมูลตัวเลือกความหวานมาจากสถาปัตยกรรมตัวแปรฐานข้อมูลกลาง (Settings) เรียบร้อยแล้ว
            drink_sweet = st.selectbox("4. ระดับความหวาน", sweet_options)
        
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
# แท็บที่ 2: แดชบอร์ดแอดมิน + ระบบ AI Vision + AI Scheduling 
# ==========================================
with tab2:
    st.header("📊 หน้าควบคุมและสรุปผลสำหรับแอดมิน")
    password_input = st.text_input("กรุณากรอกรหัสผ่าน Admin:", type="password")
    
    if password_input == st.secrets["admin_password"]:
        st.success("🔓 เข้าสู่ระบบหลังบ้านสำเร็จ")
        st.divider()
        
        st.subheader("🤖 ระบบ AI ช่วยอ่านเมนูอาหาร/เครื่องดื่มจากรูปภาพ")
        upload_col, ai_col = st.columns([1, 1])
        
        with upload_col:
            img_file = st.file_uploader("อัปโหลดไฟล์รูปเมนูร้านค้า (JPG, PNG, WEBP)", type=["jpg", "png", "jpeg", "webp"])
            menu_type = st.radio("รูปภาพนี้คือเมนูหมวดไหน?", ["อาหารกลางวัน", "เครื่องดื่ม"])
            
            if img_file is not None:
                image = Image.open(img_file)
                st.image(image, caption="ภาพเมนูที่อัปโหลด", use_column_width=True)
                
        with ai_col:
            st.info("💡 ข้อแนะนำ: เมื่อ AI อ่านเสร็จ ข้อความจะถูกนำไปวางในกล่องตั้งค่าด้านล่างอัตโนมัติ")
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
        
        st.subheader("⚙️ ตรวจสอบและตั้งค่าสวัสดิการประจำรอบ (คั่นด้วยเครื่องหมาย ,)")
        
        # 📌 ปรับการจัดวาง Layout ใหม่เป็นรูปแบบ 2x2 เพื่อรองรับกล่องความหวานอย่างเป็นระเบียบสวยงาม
        config_row1_col1, config_row1_col2 = st.columns(2)
        with config_row1_col1:
            new_lunch_str = st.text_area("รายการอาหารกลางวัน", value=st.session_state.draft_lunch, height=120)
        with config_row1_col2:
            new_drink_str = st.text_area("รายการเครื่องดื่ม", value=st.session_state.draft_drink, height=120)
            
        config_row2_col1, config_row2_col2 = st.columns(2)
        with config_row2_col1:
            new_sport_str = st.text_area("รายการกิจกรรมกีฬา", value=",".join(sport_options), height=120)
        with config_row2_col2:
            # 👍 กล่องตั้งค่าระดับความหวานสำหรับแอดมิน เปิดใช้งานแล้ว!
            new_sweet_str = st.text_area("ระดับความหวาน", value=",".join(sweet_options), height=120)
            
        if st.button("💾 Save & Publish เปิดฟอร์มรอบใหม่"):
            list_lunch = list(dict.fromkeys([x.strip() for x in new_lunch_str.split(",") if x.strip() != ""]))
            list_drink = list(dict.fromkeys([x.strip() for x in new_drink_str.split(",") if x.strip() != ""]))
            list_sport = list(dict.fromkeys([x.strip() for x in new_sport_str.split(",") if x.strip() != ""]))
            list_sweet = list(dict.fromkeys([x.strip() for x in new_sweet_str.split(",") if x.strip() != ""]))
            
            # คำนวณความยาวสูงสุดเพื่อทำ Data Padding โยนเข้าสเปรดชีตเป็นแนวตั้งอย่างถูกต้อง
            max_len = max(len(list_lunch), len(list_drink), len(list_sport), len(list_sweet))
            list_lunch += [""] * (max_len - len(list_lunch))
            list_drink += [""] * (max_len - len(list_drink))
            list_sport += [""] * (max_len - len(list_sport))
            list_sweet += [""] * (max_len - len(list_sweet))
            
            sheet_settings.clear()
            # 📌 เขียนหัวตารางคอลัมน์ที่ 4 (Sweetness) ลงใน Database
            sheet_settings.append_row(["Lunch", "Drink", "Sport", "Sweetness"])
            for i in range(max_len):
                sheet_settings.append_row([list_lunch[i], list_drink[i], list_sport[i], list_sweet[i]])
                
            st.success("🎉 อัปเดตรายการสวัสดิการและระดับความหวานสำเร็จ!")
            st.session_state.draft_lunch = ",".join([x for x in list_lunch if x != ""])
            st.session_state.draft_drink = ",".join([x for x in list_drink if x != ""])
            st.rerun()
            
        st.divider()
        
        # --- ดึงข้อมูลการลงทะเบียนและเปิดส่วนการวาดกราฟ/ตาราง ---
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
            
            st.divider()
            st.header("🧠 AI Scheduling Engine (ร่างตารางอัตโนมัติ)")
            
            if not df_attending.empty:
                df_attending['Topic_Clean'] = df_attending['Topic'].astype(str).str.strip()
                df_agenda = df_attending[(df_attending['Topic_Clean'] != "") & (df_attending['Topic_Clean'] != "-") & (df_attending['Topic_Clean'].str.lower() != "nan")].copy()
                
                st.markdown("#### ⚙️ การตั้งค่าเวลาเริ่มต้นการประชุม (Dynamic Baseline)")
                col_time1, col_time2 = st.columns(2)
                with col_time1:
                    input_time = st.time_input("เลือกเวลาเริ่มประชุม (เช่น 08:00 หรือ 08:30)", value=datetime.strptime("08:30", "%H:%M").time())
                
                base_start_dt = datetime.combine(datetime.today(), input_time)
                opening_end_dt = base_start_dt + timedelta(minutes=45) 
                
                start_str = base_start_dt.strftime("%H.%M")
                opening_end_str = opening_end_dt.strftime("%H.%M")
                
                st.info(f"💡 วาระเปิดงาน 45 นาที จะถูกจัดสรรให้อัตโนมัติในช่วง: **{start_str} น. - {opening_end_str} น.**")
                
                if df_agenda.empty:
                    st.info("📌 ยังไม่มีวาระการประชุมที่ถูกเสนอเข้ามาในรอบนี้ครับ")
                else:
                    df_agenda['Time_Numeric'] = pd.to_numeric(df_agenda['Time'], errors='coerce').fillna(0)
                    total_requested_time = int(df_agenda['Time_Numeric'].sum())
                    quota_time = 345 
                    
                    st.write(f"⏱️ **เวลาที่ต้องการใช้ทั้งหมด:** {total_requested_time} นาที / โควตาจัดสรร: {quota_time} นาที")
                    
                    if total_requested_time > quota_time:
                        st.error(f"⚠️ เวลาเกินโควตาไป {total_requested_time - quota_time} นาที (Over Time)")
                    elif total_requested_time < quota_time:
                        st.success(f"✅ เวลาอยู่ในโควตา (เหลือเวลา {quota_time - total_requested_time} นาที)")
                    else:
                        st.success("✅ เวลาพอดีโควตาเป๊ะ!")

                    agenda_list_str = ""
                    for index, row in df_agenda.iterrows():
                        agenda_list_str += f"- หัวข้อ: {row['Topic_Clean']} (ผู้นำเสนอ: {row['Name']}, เวลา: {row['Time_Numeric']} นาที)\n"
                        
                    if st.button("🪄 Generate Schedule by AI (ร่างตารางประชุมอัตโนมัติ)", use_container_width=True):
                        with st.spinner("🧠 AI กำลังคำนวณการจัดเรียงวาระ..."):
                            try:
                                prompt = f"""
                                คุณคือผู้เชี่ยวชาญด้านการจัดตารางประชุม
                                นำรายการวาระต่อไปนี้ไปจัดเรียงเป็นตารางเวลาให้สมบูรณ์ โดยจัดกลุ่มหัวข้อที่คล้ายกันให้อยู่ใกล้กัน:
                                {agenda_list_str}
                                
                                กฎ (Rules):
                                1. {start_str}-{opening_end_str} น.: เปิดงาน/แจ้งสถานการณ์ (คงที่, ใช้เวลา 45 นาที)
                                2. 12.00-13.00 น.: พักรับประทานอาหารกลางวัน (คงที่)
                                3. 16.30-17.00 น.: สรุปงาน/ปิดการประชุม (คงที่)
                                4. แทรก 'พักเบรก 15 นาที' จำนวน 2 ครั้ง (เช้า 1, บ่าย 1) ใกล้กึ่งกลางช่วงที่สุด
                                5. ห้ามแทรกเบรกตัดกลางวาระใดๆ โดยเด็ดขาด
                                
                                ⚠️ ข้อกำหนดรูปแบบการตอบกลับ (Strict Output Format):
                                ห้ามพิมพ์คำอธิบายใดๆ ทั้งสิ้น ให้ตอบกลับมาเป็นข้อมูลคั่นด้วยเครื่องหมาย Pipe (|) เท่านั้น
                                โดยมี Header ดังนี้:
                                Time|Topic|Presenter|Duration
                                ตัวอย่าง:
                                08.30-09.15|เปิดงาน/แจ้งสถานการณ์|Admin|45
                                09.15-10.15|อัปเดตสถานการณ์ PRRS|น.สพ.สมชาย|60
                                """
                                response = vision_model.generate_content(prompt)
                                raw_text = response.text.strip().replace("```csv", "").replace("```text", "").replace("```", "").strip()
                                
                                df_initial = pd.read_csv(io.StringIO(raw_text), sep='|')
                                if 'Order' not in df_initial.columns:
                                    df_initial.insert(0, 'Order', [float(i) for i in range(1, len(df_initial) + 1)])
                                    
                                # 📌 ส่งค่า base_start_dt วิ่งเข้าท่อคำนวณฟังก์ชันโดยตรง แก้ไขปัญหา NameError หน้างาน
                                st.session_state.ai_draft_df = recalculate_schedule_times(df_initial, base_start_dt)
                                st.success("🎉 AI สร้างตารางเสร็จสิ้น!")
                            except Exception as e:
                                st.error(f"เกิดข้อผิดพลาดจาก AI: {e}")

                    if 'ai_draft_df' in st.session_state:
                        st.markdown("### 📝 ตรวจสอบและแก้ไขตาราง (Admin Editor)")
                        edited_df = st.data_editor(
                            st.session_state.ai_draft_df, 
                            num_rows="dynamic", 
                            use_container_width=True,
                            key="schedule_editor_reactive"
                        )
                        
                        # 📌 ส่งค่า base_start_dt วิ่งเข้าไปในกระบวนการตรวจจับความเปลี่ยนแปลงแบบเรียลไทม์ (Reactive Engine)
                        recalculated_df = recalculate_schedule_times(edited_df, base_start_dt)
                        
                        if not recalculated_df.equals(st.session_state.ai_draft_df):
                            st.session_state.ai_draft_df = recalculated_df
                            st.rerun()
                            
                        st.divider()
                        
                        csv_export = recalculated_df.to_csv(index=False).encode('utf-8-sig')
                        st.download_button(
                            label="📥 Finalize & Export to Excel (CSV)",
                            data=csv_export,
                            file_name=f"SVS_Meeting_Schedule_{datetime.now().strftime('%Y%m%d')}.csv",
                            mime="text/csv",
                            type="primary",
                            use_container_width=True
                        )
            else:
                st.info("📌 ยังไม่มีผู้ลงทะเบียนเข้าร่วมประชุมครับ")
    else:
        if password_input != "":
            st.error("❌ รหัสผ่านไม่ถูกต้อง!")
