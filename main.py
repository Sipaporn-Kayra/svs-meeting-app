import streamlit as st
import json
import gspread
import pandas as pd
from datetime import datetime, timedelta
import google.generativeai as genai
from PIL import Image
import io

# 1. ตั้งค่าหัวเว็บ
st.set_page_config(page_title="SVS Meeting Portal", page_icon="🩺", layout="wide")
st.title("🩺 ระบบจัดการประชุมและสวัสดิการ SVS")

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

@st.cache_data(ttl=300) 
def get_cached_settings():
    return sheet_settings.get_all_values()

@st.cache_data(ttl=60) 
def get_cached_users():
    return sheet_user.get_all_records()

settings_data = get_cached_settings()
settings_dict = {}
if len(settings_data) > 1:
    for row in settings_data[1:]:
        if len(row) >= 2:
            settings_dict[row[0]] = row[1]

date_options = [x.strip() for x in settings_dict.get("Global_Dates", datetime.now().strftime("%Y-%m-%d")).split(",") if x.strip()]
employee_options = [x.strip() for x in settings_dict.get("Global_Employees", "Admin,Kayra").split(",") if x.strip()]
sport_options = [x.strip() for x in settings_dict.get("Global_Sport", "บาส,บอล,ไม่เข้าร่วม").split(",") if x.strip()]
sweet_options = [x.strip() for x in settings_dict.get("Global_Sweetness", "หวานปกติ (100%),หวานน้อย (50%),ไม่หวาน (0%),หวานมาก (120%)").split(",") if x.strip()]

def recalculate_schedule_times(df, base_start_dt):
    df_clean = df.copy()
    if 'Order' in df_clean.columns:
        try:
            df_clean['Order'] = pd.to_numeric(df_clean['Order'], errors='coerce').fillna(999)
            df_clean = df_clean.sort_values(by='Order').reset_index(drop=True)
        except: pass
    try:
        current_time = base_start_dt 
        for idx, row in df_clean.iterrows():
            topic_str = str(row.get('Topic', '')).strip()
            if topic_str in ["พักรับประทานอาหารกลางวัน", "พักเที่ยง"]:
                lunch_time = current_time.replace(hour=12, minute=0, second=0, microsecond=0)
                if current_time < lunch_time: current_time = lunch_time
            elif topic_str in ["สรุปงาน/ปิดการประชุม", "ปิดการประชุม"]:
                closing_time = current_time.replace(hour=16, minute=30, second=0, microsecond=0)
                if current_time < closing_time: current_time = closing_time
            
            start_str = current_time.strftime("%H.%M")
            try: duration = int(float(row.get('Duration', 0)))
            except: duration = 0
            end_time = current_time + timedelta(minutes=duration)
            end_str = end_time.strftime("%H.%M")
            df_clean.at[idx, 'Time'] = f"{start_str}-{end_str}"
            current_time = end_time
            
        if 'Order' in df_clean.columns: df_clean['Order'] = [float(i) for i in range(1, len(df_clean) + 1)]
    except: pass
    return df_clean

tab1, tab2 = st.tabs(["📝 ฟอร์มลงทะเบียน (User)", "📊 แดชบอร์ดแอดมิน (Admin)"])

# ==========================================
# แท็บที่ 1: ฟอร์มลงทะเบียน (User Portal)
# ==========================================
with tab1:
    st.header("แบบฟอร์มลงทะเบียนเข้าร่วมประชุม")
    st.subheader("1. ข้อมูลส่วนตัว")
    name = st.selectbox("ชื่อ-นามสกุล (สามารถพิมพ์ค้นหาได้)", employee_options)
    is_attending = st.radio("สถานะการเข้าร่วม", ["เข้าร่วม", "ไม่เข้าร่วม"])
    
    selected_dates = st.multiselect("📅 เลือกวันที่เข้าร่วมประชุม (เลือกได้หลายวัน)", date_options)
    day_choices = {} 
    
    if is_attending == "เข้าร่วม" and len(selected_dates) > 0:
        st.subheader("2. สวัสดิการ (เลือกแยกตามวันได้)")
        for d in selected_dates:
            with st.expander(f"🍽️ กำหนดสวัสดิการสำหรับวันที่: {d}", expanded=True):
                day_lunch_raw = settings_dict.get(f"Lunch_{d}", "")
                day_drink_raw = settings_dict.get(f"Drink_{d}", "")
                day_lunch_options = [x.strip() for x in day_lunch_raw.split(",") if x.strip()] if day_lunch_raw else ["ไม่มีเมนู (กรุณาแจ้งแอดมิน)"]
                day_drink_options = [x.strip() for x in day_drink_raw.split(",") if x.strip()] if day_drink_raw else ["ไม่มีเมนู (กรุณาแจ้งแอดมิน)"]
                
                lunch = st.multiselect(f"เมนูอาหารกลางวัน ({d})", day_lunch_options, key=f"lunch_{d}")
                
                drink_col1, drink_col2 = st.columns(2)
                with drink_col1:
                    drink_base = st.selectbox("เมนูหลัก", day_drink_options, key=f"drink_{d}")
                    drink_roast = st.selectbox("เมล็ดกาแฟ", ["ไม่ระบุ", "คั่วอ่อน", "คั่วกลาง", "คั่วเข้ม"], key=f"roast_{d}")
                with drink_col2:
                    drink_temp = st.selectbox("รูปแบบ", ["เย็น", "ร้อน", "ปั่น"], key=f"temp_{d}")
                    drink_sweet = st.selectbox("ระดับความหวาน", sweet_options, key=f"sweet_{d}")
                
                sport = st.selectbox(f"กิจกรรมกีฬา ({d})", sport_options, key=f"sport_{d}")
                
                day_choices[d] = {
                    "lunch": lunch,
                    "drink": f"{drink_base} ({drink_temp}{', '+drink_roast if drink_roast != 'ไม่ระบุ' else ''}, {drink_sweet})",
                    "sport": sport
                }
    
    st.subheader("3. วาระการประชุม (เสนอได้หลายวาระ)")
    st.info("💡 หากมีมากกว่า 1 วาระ ให้พิมพ์ในตารางด้านล่าง ระบุเวลาแยกกัน และเลือก 'วันที่นำเสนอ' ให้ถูกต้อง")
    
    default_agenda = pd.DataFrame([{"วันที่นำเสนอ": date_options[0] if date_options else "", "หัวข้อการประชุม": "", "เวลาที่ใช้ (นาที)": 0}])
    user_agendas = st.data_editor(
        default_agenda, 
        num_rows="dynamic", 
        use_container_width=True,
        hide_index=True,
        column_config={"วันที่นำเสนอ": st.column_config.SelectboxColumn("วันที่นำเสนอ", options=date_options, required=True)}
    )
    
    submitted = st.button("ส่งข้อมูลลงทะเบียน", type="primary", use_container_width=True)
    
    if submitted:
        if name == "": st.error("กรุณาเลือกชื่อ-นามสกุลด้วยครับ!")
        elif is_attending == "เข้าร่วม" and len(selected_dates) == 0: st.error("กรุณาเลือกวันที่เข้าร่วมอย่างน้อย 1 วันครับ!")
        else:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            valid_agendas = user_agendas[user_agendas["หัวข้อการประชุม"].str.strip() != ""]
            
            if len(sheet_user.get_all_values()) == 0:
                sheet_user.append_row(["Timestamp", "Name", "Attendance", "Date", "Lunch", "Drink", "Sport", "Topic", "Time"])
            
            if is_attending == "ไม่เข้าร่วม":
                sheet_user.append_row([timestamp, name, "ไม่เข้าร่วม", "-", "-", "-", "-", "-", 0])
            else:
                for d in selected_dates:
                    lunch_str = ", ".join(day_choices[d]["lunch"]) if len(day_choices[d]["lunch"]) > 0 else "ไม่ได้ระบุ"
                    final_drink_str = day_choices[d]["drink"]
                    sport_str = day_choices[d]["sport"]
                    agendas_for_day = valid_agendas[valid_agendas["วันที่นำเสนอ"] == d]
                    
                    if agendas_for_day.empty:
                        sheet_user.append_row([timestamp, name, "เข้าร่วม", d, lunch_str, final_drink_str, sport_str, "-", 0])
                    else:
                        is_first_row = True
                        for idx, row in agendas_for_day.iterrows():
                            topic_val = str(row["หัวข้อการประชุม"]).strip()
                            time_val = int(row["เวลาที่ใช้ (นาที)"])
                            if is_first_row:
                                sheet_user.append_row([timestamp, name, "เข้าร่วม", d, lunch_str, final_drink_str, sport_str, topic_val, time_val])
                                is_first_row = False
                            else:
                                sheet_user.append_row([timestamp, name, "เข้าร่วม", d, "-", "-", "-", topic_val, time_val])
                                
            st.success("บันทึกข้อมูลเรียบร้อย!")
            get_cached_users.clear() 
            st.balloons()

# ==========================================
# แท็บที่ 2: แดชบอร์ดแอดมิน
# ==========================================
with tab2:
    st.header("📊 หน้าควบคุมและสรุปผลสำหรับแอดมิน")
    password_input = st.text_input("กรุณากรอกรหัสผ่าน Admin:", type="password")
    
    if password_input == st.secrets["admin_password"]:
        st.success("🔓 เข้าสู่ระบบหลังบ้านสำเร็จ")
        st.divider()
        
        # 📌 UX UPGRADE: นำส่วน AI และตั้งค่าไป "พับเก็บ" ไว้ใน st.expander เพื่อประหยัดพื้นที่จอ
        with st.expander("🤖 แผงผู้ช่วย AI อ่านเมนูอาหาร/เครื่องดื่มจากรูปภาพ", expanded=False):
            if 'ai_draft' not in st.session_state: st.session_state.ai_draft = ""
            upload_col, ai_col = st.columns([1, 1])
            with upload_col:
                img_file = st.file_uploader("อัปโหลดไฟล์รูปเมนูร้านค้า", type=["jpg", "png", "jpeg", "webp"])
                if img_file is not None:
                    image = Image.open(img_file)
                    st.image(image, use_column_width=True)
            with ai_col:
                st.info("💡 นำข้อความในกล่องนี้ ไปก๊อปปี้วางในช่องเมนูอาหารด้านล่างได้เลยครับ")
                st.text_area("📋 กล่องพักข้อความจาก AI (Draft Box)", value=st.session_state.ai_draft, height=100)
                if img_file is not None and st.button("✨ ให้ AI สกัดรายชื่อเมนู", use_container_width=True):
                    with st.spinner("AI กำลังวิเคราะห์รูปภาพ..."):
                        try:
                            ai_prompt = "อ่านเมนูและดึงเฉพาะชื่อเมนู คั่นด้วยเครื่องหมายจุลภาค (,) เท่านั้น"
                            response = vision_model.generate_content([ai_prompt, image])
                            st.session_state.ai_draft = response.text.strip()
                            st.rerun() 
                        except Exception as e:
                            st.error(f"Error: {e}")
        
        with st.expander("⚙️ ตรวจสอบและตั้งค่า Master Data ประจำรอบ", expanded=False):
            new_dates_str = st.text_input("📅 วันที่จัดประชุม (คั่นด้วยลูกน้ำ เช่น 2026-08-27,2026-08-28)", value=",".join(date_options))
            new_employee_str = st.text_area("👥 รายชื่อพนักงานทั้งหมด", value=",".join(employee_options), height=60)
            
            config_row_g1, config_row_g2 = st.columns(2)
            with config_row_g1: new_sport_str = st.text_area("รายการกิจกรรมกีฬา (Global)", value=",".join(sport_options), height=60)
            with config_row_g2: new_sweet_str = st.text_area("ระดับความหวาน (Global)", value=",".join(sweet_options), height=60)
            
            st.markdown("#### 🍽️ ตั้งค่าเมนูอาหารแยกตามวัน")
            date_list_live = [x.strip() for x in new_dates_str.split(",") if x.strip()]
            daily_menu_inputs = {}
            if date_list_live:
                tabs = st.tabs(date_list_live)
                for i, d in enumerate(date_list_live):
                    with tabs[i]:
                        col1, col2 = st.columns(2)
                        with col1:
                            l_val = settings_dict.get(f"Lunch_{d}", "")
                            daily_menu_inputs[f"Lunch_{d}"] = st.text_area(f"อาหารกลางวัน ({d})", value=l_val, key=f"admin_l_{d}", height=100)
                        with col2:
                            d_val = settings_dict.get(f"Drink_{d}", "")
                            daily_menu_inputs[f"Drink_{d}"] = st.text_area(f"เครื่องดื่ม ({d})", value=d_val, key=f"admin_d_{d}", height=100)
            
            if st.button("💾 Save & Publish เปิดฟอร์มรอบใหม่", type="primary"):
                sheet_settings.clear()
                sheet_settings.append_row(["Key", "Value"])
                sheet_settings.append_row(["Global_Dates", new_dates_str])
                sheet_settings.append_row(["Global_Employees", new_employee_str])
                sheet_settings.append_row(["Global_Sport", new_sport_str])
                sheet_settings.append_row(["Global_Sweetness", new_sweet_str])
                
                for key, val in daily_menu_inputs.items():
                    cleaned_val = ",".join([x.strip() for x in val.split(",") if x.strip()])
                    sheet_settings.append_row([key, cleaned_val])
                    
                st.success("🎉 อัปเดตข้อมูล Master Data สำเร็จ!")
                get_cached_settings.clear()
                st.rerun()

        st.divider()
        
        # 📌 ไฮไลท์การแก้ปัญหา: กล่องตัวกรองจะดันขึ้นมาอยู่ "ตรงกลางจอ มองเห็นทันที" ทันทีที่ล็อกอิน!
        st.markdown("### 🔍 แผงควบคุมและสรุปข้อมูล (Main Control Panel)")
        
        data = get_cached_users()
        df = pd.DataFrame(data) if data else pd.DataFrame()
        df_attending = pd.DataFrame()
        filter_date = "รวมทุกวัน"

        if not df.empty:
            # 🛑 1. วางสถาปัตยกรรม Fail-Fast (Schema Validation) แทรกไว้ตรงนี้!
            expected_columns = ['Timestamp', 'Name', 'Attendance', 'Date', 'Lunch', 'Drink', 'Sport', 'Topic', 'Time']
            missing_columns = [col for col in expected_columns if col not in df.columns]
            
            if missing_columns:
                st.error("🚨 **ตรวจพบความผิดปกติของฐานข้อมูล (Schema Mismatch)!**")
                st.warning(f"**สาเหตุ:** โครงสร้างตารางใน Google Sheets ไม่อัปเดต (ขาดคอลัมน์: `{', '.join(missing_columns)}`) \n\n**🛠️ วิธีแก้ไขด้วยตัวเอง:** \n1. เข้าไปที่ Google Sheets แท็บ `sheet1` \n2. กดลบข้อมูลเก่าทิ้งให้หมด (รวมถึงแถวบนสุดที่เป็นหัวตาราง) \n3. กลับมาที่แอปนี้แล้วลองกด 'ลงทะเบียน' ใหม่อีก 1 ครั้ง ระบบจะสร้างโครงสร้างใหม่ให้ถูกต้องอัตโนมัติครับ")
                st.stop() # หยุดการทำงานทันที ป้องกันแอปพังลาม
                
            # ---------------------------------------------------------
            # ✅ 2. ถ้าโครงสร้างตารางถูกต้อง (ผ่านด่านบนมาได้) ถึงจะรันโค้ดแสดงผลตามปกติ
            # ---------------------------------------------------------
            if 'Date' in df.columns:
                # 📌 ตัวกรองเด่นหราเตะตา ไม่มีทางหาไม่เจอแน่นอน!
                filter_date = st.selectbox("📅 กรุณาเลือก 'วันที่' ที่ต้องการดูข้อมูล และสร้างตารางประชุม", ["รวมทุกวัน"] + date_options)
                if filter_date != "รวมทุกวัน": 
                    df = df[df['Date'] == filter_date]
            
            df_attending = df[df['Attendance'] == 'เข้าร่วม']
        if not df.empty:
            if 'Date' in df.columns:
                # 📌 The Fix: ยัดบัตรประชาชน (key) ให้กับ Dropdown ป้องกันการชนกัน 100%
                filter_date = st.selectbox(
                    "📅 กรุณาเลือก 'วันที่' ที่ต้องการดูข้อมูล และสร้างตารางประชุม", 
                    ["รวมทุกวัน"] + date_options,
                    key="admin_main_date_filter_unique_id"
                )
            
            df_attending = df[df['Attendance'] == 'เข้าร่วม']
            
            st.subheader("🍔 ยอดสรุปการสั่งอาหารและเครื่องดื่ม")
            if not df_attending.empty:
                chart_col1, chart_col2 = st.columns(2)
                with chart_col1:
                    lunch_series = df_attending['Lunch'].astype(str).str.split(', ').explode()
                    lunch_series = lunch_series[~lunch_series.isin(["ไม่ได้ระบุ", "ไม่มีเมนู (กรุณาแจ้งแอดมิน)", "-"])]
                    if not lunch_series.empty: st.bar_chart(lunch_series.value_counts(), color="#FF4B4B")
                with chart_col2:
                    drink_series = df_attending['Drink'].astype(str)
                    drink_series = drink_series[~drink_series.isin(["ไม่ได้ระบุ", "ไม่มีเมนู (กรุณาแจ้งแอดมิน)", "-"])]
                    if not drink_series.empty: st.bar_chart(drink_series.value_counts(), color="#00C0F2")
                    
            st.subheader("📋 ตารางรายชื่อและข้อมูลดิบทั้งหมด (Raw Data)")
            st.dataframe(df, use_container_width=True)
        else:
            st.info("📌 ยังไม่มีข้อมูลผู้ลงทะเบียนในระบบ แดชบอร์ดสรุปยอดและตารางข้อมูลจะปรากฏขึ้นอัตโนมัติเมื่อมีผู้ใช้งานลงทะเบียนเข้ามาครับ")

        st.divider()
        st.header("🧠 AI Scheduling Engine (ร่างตารางอัตโนมัติ)")
        
        if not df_attending.empty and filter_date != "รวมทุกวัน":
            df_attending['Topic_Clean'] = df_attending['Topic'].astype(str).str.strip()
            df_agenda = df_attending[(df_attending['Topic_Clean'] != "") & (df_attending['Topic_Clean'] != "-") & (df_attending['Topic_Clean'].str.lower() != "nan")].copy()
            
            st.markdown(f"#### ⚙️ การตั้งค่าเวลาเริ่มต้นการประชุม (สำหรับ {filter_date})")
            col_time1, col_time2 = st.columns(2)
            with col_time1:
                input_time = st.time_input("เลือกเวลาเริ่มประชุม", value=datetime.strptime("08:30", "%H:%M").time())
            
            base_start_dt = datetime.combine(datetime.today(), input_time)
            opening_end_dt = base_start_dt + timedelta(minutes=45) 
            start_str, opening_end_str = base_start_dt.strftime("%H.%M"), opening_end_dt.strftime("%H.%M")
            
            if df_agenda.empty:
                st.info("📌 ยังไม่มีวาระการประชุมที่ถูกเสนอเข้ามาในรอบนี้ครับ")
            else:
                df_agenda['Time_Numeric'] = pd.to_numeric(df_agenda['Time'], errors='coerce').fillna(0)
                total_requested_time = int(df_agenda['Time_Numeric'].sum())
                
                quota_time = 1020 - ((input_time.hour * 60) + input_time.minute) - 165
                quota_time = 0 if quota_time < 0 else quota_time
                
                st.write(f"⏱️ **เวลาที่ต้องการใช้ทั้งหมด:** {total_requested_time} นาที / โควตาจัดสรร: {quota_time} นาที")
                if total_requested_time > quota_time: st.error(f"⚠️ เวลาเกินโควตาไป {total_requested_time - quota_time} นาที (Over Time)")
                else: st.success(f"✅ เวลาอยู่ในโควตา (เหลือเวลา {quota_time - total_requested_time} นาที)")

                agenda_list_str = "".join([f"- หัวข้อ: {row['Topic_Clean']} (โดย: {row['Name']}, {row['Time_Numeric']} นาที)\n" for idx, row in df_agenda.iterrows()])
                    
                if st.button(f"🪄 ให้ AI ร่างตารางของวันที่ {filter_date}", use_container_width=True):
                    with st.spinner("🧠 AI กำลังคำนวณ..."):
                        try:
                            prompt = f"""
                            นำรายการวาระต่อไปนี้ไปจัดตาราง:
                            {agenda_list_str}
                            
                            กฎ (Rules):
                            1. {start_str}-{opening_end_str} น.: เปิดงาน/แจ้งสถานการณ์ (คงที่, ใช้เวลา 45 นาที)
                            2. 12.00-13.00 น.: พักรับประทานอาหารกลางวัน (คงที่)
                            3. 16.30-17.00 น.: สรุปงาน/ปิดการประชุม (คงที่)
                            4. แทรก 'พักเบรก 15 นาที' จำนวน 2 ครั้ง (เช้า 1, บ่าย 1)
                            
                            ⚠️ รูปแบบ: ตอบกลับเป็นข้อมูลคั่นด้วย Pipe (|) ห้ามพิมพ์อธิบาย ห้ามใส่ Header
                            ตัวอย่าง:
                            08.30-09.15|เปิดงาน/แจ้งสถานการณ์|Admin|45
                            """
                            response = vision_model.generate_content(prompt)
                            raw_text = response.text.strip().replace("```csv", "").replace("```text", "").replace("```", "").strip()
                            
                            df_initial = pd.read_csv(io.StringIO(raw_text), sep='|', names=['Time', 'Topic', 'Presenter', 'Duration'], header=None)
                            if df_initial.iloc[0]['Time'] in ['Time', 'Topic']: df_initial = df_initial.iloc[1:].reset_index(drop=True)
                            df_initial = df_initial[~df_initial['Time'].astype(str).str.contains('---')].reset_index(drop=True)
                            if 'Order' not in df_initial.columns: df_initial.insert(0, 'Order', [float(i) for i in range(1, len(df_initial) + 1)])
                                
                            st.session_state.ai_draft_df = recalculate_schedule_times(df_initial, base_start_dt)
                            st.success("🎉 AI สร้างตารางเสร็จสิ้น!")
                        except Exception as e:
                            st.error(f"Error: {e}")

                if 'ai_draft_df' in st.session_state:
                    edited_df = st.data_editor(st.session_state.ai_draft_df, num_rows="dynamic", use_container_width=True, key="schedule_editor_reactive")
                    recalculated_df = recalculate_schedule_times(edited_df, base_start_dt)
                    if not recalculated_df.equals(st.session_state.ai_draft_df):
                        st.session_state.ai_draft_df = recalculated_df
                        st.rerun()
                    csv_export = recalculated_df.to_csv(index=False).encode('utf-8-sig')
                    st.download_button("📥 Finalize & Export to Excel", data=csv_export, file_name=f"Schedule_{filter_date}.csv", mime="text/csv", use_container_width=True)
        elif df.empty:
            st.info("📌 ระบบ AI Scheduler ยังไม่สามารถทำงานได้ เนื่องจากยังไม่มีข้อมูลวาระการประชุมในฐานข้อมูลครับ")
        elif filter_date == "รวมทุกวัน":
            st.warning("⚠️ กรุณาเลือก 'วันที่' จากตัวกรองด้านบนก่อน เพื่อให้ AI สร้างตารางแบบแยกวันได้อย่างถูกต้องครับ")
    else:
        if password_input != "":
            st.error("❌ รหัสผ่านไม่ถูกต้อง!")
