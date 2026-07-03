/**
 * Gemini Wallpaper - Assistant
 *
 * A floating glass orb (like the iPhone AssistiveTouch button):
 *   • draggable, snaps to the nearest screen edge on release
 *   • fades translucent when idle, wakes on touch/hover
 *   • breathing + glowing-glass shimmer
 *   • TAP springs open the Assistant menu
 *
 * Menu (laid out to match the guide): a scrollable grid of round feature icons
 * in a fixed order, a "settings" rounded-rectangle button below the grid, and
 * an intro tooltip that appears ON the icon you hover. Clicking a circle
 * toggles its feature or opens its mini-panel (wallpaper / pet / about).
 *
 * Writes only chrome.storage.local keys the other modules already watch.
 */
(function () {
  "use strict";

  const KEY_ON = "magicBall";        // storage key kept for back-compat
  const KEY_POS = "magicBallPos";
  const SIZE = 56;
  const EDGE = 14;
  const IDLE_MS = 2600;
  const CLICK_PX = 6;

  const ICO = (f) => chrome.runtime.getURL("assets/icons/assistant/" + f);
  const GITHUB = "https://github.com/Buddy-Lu/Gemini-wallpaper";

  // ── i18n ──────────────────────────────────────────────────
  // Eight languages, one flat dictionary keyed by string id. Every visible
  // label/intro/note flows through t(); the About feature list reuses the same
  // item labels + intros, so there's a single source of copy to translate.
  const LANGS = [
    ["en", "English"], ["zh", "繁體中文"], ["ja", "日本語"], ["ko", "한국어"],
    ["fr", "Français"], ["de", "Deutsch"], ["es", "Español"], ["ru", "Русский"],
  ];

  const I18N = {
    // Home / chrome
    assistant: { en: "Assistant", zh: "助理", ja: "アシスタント", ko: "어시스턴트", fr: "Assistant", de: "Assistent", es: "Asistente", ru: "Ассистент" },
    settings:  { en: "Settings", zh: "設定", ja: "設定", ko: "설정", fr: "Paramètres", de: "Einstellungen", es: "Ajustes", ru: "Настройки" },

    // Item labels (also used as sub-panel headers)
    wallpaper:   { en: "Wallpaper", zh: "專屬桌布", ja: "カスタム壁紙", ko: "배경화면", fr: "Fond d'écran", de: "Hintergrund", es: "Fondo", ru: "Обои" },
    pet:         { en: "Pet", zh: "桌面寵物", ja: "ペット", ko: "데스크탑 펫", fr: "Compagnon", de: "Haustier", es: "Mascota", ru: "Питомец" },
    chatbox:     { en: "Chatbox", zh: "對話框", ja: "チャット窓", ko: "채팅창", fr: "Fenêtre", de: "Chatfenster", es: "Ventana", ru: "Окно чата" },
    font:        { en: "Word Font", zh: "字體", ja: "フォント", ko: "폰트", fr: "Polices", de: "Schrift", es: "Fuentes", ru: "Шрифты" },
    about:       { en: "About", zh: "關於", ja: "概要", ko: "정보", fr: "À propos", de: "Über", es: "Acerca de", ru: "O программе" },
    highlighter: { en: "Highlighter", zh: "螢光筆", ja: "マーカー", ko: "형광펜", fr: "Surligneur", de: "Marker", es: "Marcador", ru: "Маркер" },
    notes:       { en: "Sticky Notes", zh: "便利貼", ja: "付箋メモ", ko: "스티커 메모", fr: "Pense-bêtes", de: "Notizen", es: "Notas", ru: "Заметки" },
    bulk:        { en: "Bulk Delete", zh: "批次刪除", ja: "一括削除", ko: "일괄 삭제", fr: "Suppression", de: "Löschen", es: "Borrado", ru: "Удаление" },
    math:        { en: "Math Fixer", zh: "數學修復", ja: "数式修正", ko: "수식 복원", fr: "Maths", de: "Mathe", es: "Fórmulas", ru: "Формулы" },
    code:        { en: "Code Theme", zh: "程式碼主題", ja: "コードテーマ", ko: "코드 테마", fr: "Thème code", de: "Code-Thema", es: "Tema código", ru: "Тема кода" },
    hide:        { en: "Hide Chat", zh: "隱藏對話", ja: "会話を隠す", ko: "대화 숨기기", fr: "Masquer", de: "Ausblenden", es: "Ocultar", ru: "Скрыть чат" },
    buddy:       { en: "Thinking Buddy", zh: "思考夥伴", ja: "思考バディ", ko: "생각 버디", fr: "Compagnon", de: "Denk-Buddy", es: "Compañero", ru: "Помощник" },

    // Item intros (hover tooltip + About "how to use")
    i_wallpaper:   { en: "Set a custom background image, pick its quality, and preview it.", zh: "設定自訂背景圖片，選擇畫質並即時預覽。", ja: "好きな画像を背景に設定し、画質を選んでプレビューできます。", ko: "원하는 이미지를 배경으로 설정하고 화질을 선택해 미리 봅니다.", fr: "Définissez une image de fond, choisissez sa qualité et prévisualisez-la.", de: "Lege ein eigenes Hintergrundbild fest, wähle die Qualität und sieh die Vorschau.", es: "Elige una imagen de fondo, su calidad y previsualízala.", ru: "Задайте своё фоновое изображение, выберите качество и посмотрите превью." },
    i_pet:         { en: "A tiny animated pet that wanders the screen. Pick duck, dog or fox.", zh: "一隻在螢幕上漫步的小寵物，可選小鴨、小狗或小狐狸。", ja: "画面を歩き回る小さなペット。アヒル・犬・キツネから選べます。", ko: "화면을 돌아다니는 작은 펫. 오리, 강아지, 여우 중 선택하세요.", fr: "Un petit animal animé qui se promène à l'écran : canard, chien ou renard.", de: "Ein kleines Haustier, das über den Bildschirm wandert: Ente, Hund oder Fuchs.", es: "Una mascota que pasea por la pantalla: pato, perro o zorro.", ru: "Маленький питомец гуляет по экрану: утка, пёс или лиса." },
    i_chatbox:     { en: "Turn the input into a draggable, resizable window with traffic-light controls.", zh: "把輸入區變成可拖曳、縮放的視窗，附紅黃綠三色控制鈕。", ja: "入力欄をドラッグやサイズ変更ができる、信号機ボタン付きの窓に変えます。", ko: "입력창을 신호등 버튼이 있는 이동·크기 조절 창으로 바꿉니다.", fr: "Transformez la saisie en une fenêtre déplaçable et redimensionnable.", de: "Verwandle das Eingabefeld in ein bewegliches, skalierbares Fenster.", es: "Convierte la entrada en una ventana movible y redimensionable.", ru: "Превращает поле ввода в перемещаемое окно с изменяемым размером." },
    i_font:        { en: "Pick a custom Latin + 中文 font for chat text — changes apply instantly.", zh: "為對話文字挑選英文與中文字體，點擊立即套用。", ja: "チャット文字の欧文・中文フォントを選択。クリックで即反映されます。", ko: "채팅 글자의 라틴·중문 폰트를 선택하면 즉시 적용됩니다.", fr: "Choisissez une police latine et chinoise pour le chat, appliquée aussitôt.", de: "Wähle eine Latein- und CJK-Schrift für den Chat – wirkt sofort.", es: "Elige una fuente latina y china para el chat; se aplica al instante.", ru: "Выберите латинский и китайский шрифт для чата — применяется сразу." },
    i_about:       { en: "About Gemini Wallpaper — features and how to use them.", zh: "關於 Gemini Wallpaper 的功能與使用說明。", ja: "Gemini Wallpaper の機能と使い方について。", ko: "Gemini Wallpaper의 기능과 사용법 안내.", fr: "À propos de Gemini Wallpaper — fonctions et mode d'emploi.", de: "Über Gemini Wallpaper – Funktionen und Bedienung.", es: "Acerca de Gemini Wallpaper: funciones y uso.", ru: "О Gemini Wallpaper — возможности и как ими пользоваться." },
    i_highlighter: { en: "Highlight text in a chat; the mark re-anchors even after Gemini re-renders.", zh: "在對話中畫重點；即使 Gemini 重新排版，標記仍緊跟原文。", ja: "会話内のテキストをマーク。Geminiが再描画しても印は残ります。", ko: "대화 속 텍스트를 강조하면 Gemini가 다시 그려도 표시가 유지됩니다.", fr: "Surlignez du texte ; la marque suit même après un nouveau rendu de Gemini.", de: "Markiere Text; die Markierung bleibt auch nach neuem Rendern erhalten.", es: "Resalta texto; la marca se mantiene aunque Gemini vuelva a renderizar.", ru: "Выделяйте текст — метка сохраняется даже после перерисовки Gemini." },
    i_notes:       { en: "Notes linked by an arrow to highlighted text in a chat.", zh: "用箭頭把便利貼連到對話中被標記的文字。", ja: "会話内のマークした文字に、矢印で付箋をつなげます。", ko: "강조한 텍스트에 화살표로 메모를 연결합니다.", fr: "Des notes reliées par une flèche au texte surligné.", de: "Notizen, die per Pfeil mit markiertem Text verbunden sind.", es: "Notas unidas por una flecha al texto resaltado.", ru: "Заметки, соединённые стрелкой с выделенным текстом." },
    i_bulk:        { en: "Checkboxes on sidebar chats to delete many at once.", zh: "在側邊欄對話加上核取方塊，一次刪除多筆。", ja: "サイドバーの会話にチェックボックスを付け、まとめて削除します。", ko: "사이드바 대화에 체크박스를 달아 한 번에 여러 개 삭제합니다.", fr: "Des cases sur les chats de la barre pour en supprimer plusieurs d'un coup.", de: "Kontrollkästchen an Seitenleisten-Chats, um viele auf einmal zu löschen.", es: "Casillas en los chats de la barra para borrar varios a la vez.", ru: "Флажки у чатов на панели, чтобы удалять сразу несколько." },
    i_math:        { en: "When an answer shows messy math code instead of a real equation, tap Fix to turn it into a clean, readable formula.", zh: "當回應把數學顯示成雜亂的代碼而不是算式時，點一下「修正」就能變成清晰易讀的公式。", ja: "回答が数式ではなく乱れたコードで表示されたとき、「修正」を押すと見やすいきれいな数式になります。", ko: "답변이 수식 대신 지저분한 코드로 표시될 때 '수정'을 누르면 깔끔하고 읽기 쉬운 공식으로 바뀝니다.", fr: "Quand une réponse affiche du code brouillon au lieu d'une vraie équation, touchez « Corriger » pour obtenir une formule claire et lisible.", de: "Wenn eine Antwort wirren Code statt einer echten Gleichung zeigt, tippe auf „Beheben“ für eine klare, lesbare Formel.", es: "Cuando una respuesta muestra código desordenado en vez de una ecuación real, toca «Corregir» para obtener una fórmula clara y legible.", ru: "Когда в ответе вместо формулы виден беспорядочный код, нажмите «Исправить», чтобы получить чёткую, читаемую формулу." },
    i_code:        { en: "Give each code block its own look — border, font, line numbers, tint and more.", zh: "讓每個程式碼區塊有專屬外觀——邊框、字體、行號、色調等。", ja: "コードブロックごとに外観を設定——枠線・フォント・行番号・色調など。", ko: "코드 블록마다 테두리·글꼴·줄 번호·색조 등을 개별 설정합니다.", fr: "Un style par bloc de code : bordure, police, numéros de ligne, teinte…", de: "Jeder Codeblock eigen: Rahmen, Schrift, Zeilennummern, Farbton u. a.", es: "Cada bloque de código a su estilo: borde, fuente, números, tinte…", ru: "Свой вид у каждого блока кода: рамка, шрифт, номера строк, оттенок." },
    i_hide:        { en: "Collapse any exchange to a slim bar to tidy up long sessions.", zh: "把任一段對話收合成細長條，讓長對話保持清爽。", ja: "任意のやり取りを細いバーに畳んで、長い会話をすっきりさせます。", ko: "원하는 대화를 얇은 막대로 접어 긴 세션을 깔끔하게 정리합니다.", fr: "Réduisez un échange en une fine barre pour alléger les longues sessions.", de: "Klappe einen Austausch zu einer schmalen Leiste zusammen.", es: "Contrae cualquier intercambio a una barra fina para sesiones largas.", ru: "Сворачивайте любой обмен в тонкую полоску, чтобы разгрузить длинные сессии." },
    i_buddy:       { en: "A cute mascot that pops up while Gemini is thinking.", zh: "一隻在 Gemini 思考時跳出來陪你的可愛吉祥物。", ja: "Geminiが考えている間に現れる、かわいいマスコット。", ko: "Gemini가 생각하는 동안 나타나는 귀여운 마스코트.", fr: "Une mascotte mignonne apparaît pendant que Gemini réfléchit.", de: "Ein süßes Maskottchen, das erscheint, während Gemini denkt.", es: "Una linda mascota que aparece mientras Gemini piensa.", ru: "Милый талисман появляется, пока Gemini думает." },

    // Wallpaper panel
    wp_show:    { en: "Show wallpaper", zh: "顯示桌布", ja: "壁紙を表示", ko: "배경 표시", fr: "Afficher le fond", de: "Hintergrund zeigen", es: "Mostrar fondo", ru: "Показать обои" },
    wp_choose:  { en: "Choose image…", zh: "選擇圖片…", ja: "画像を選択…", ko: "이미지 선택…", fr: "Choisir une image…", de: "Bild wählen…", es: "Elegir imagen…", ru: "Выбрать изображение…" },
    wp_quality: { en: "Image quality", zh: "圖片畫質", ja: "画質", ko: "이미지 화질", fr: "Qualité d'image", de: "Bildqualität", es: "Calidad de imagen", ru: "Качество изображения" },
    wp_look:    { en: "Appearance", zh: "外觀", ja: "外観", ko: "모양", fr: "Apparence", de: "Aussehen", es: "Apariencia", ru: "Вид" },
    q_low:      { en: "Low", zh: "低", ja: "低", ko: "낮음", fr: "Basse", de: "Niedrig", es: "Baja", ru: "Низкое" },
    q_medium:   { en: "Medium", zh: "中", ja: "中", ko: "보통", fr: "Moyenne", de: "Mittel", es: "Media", ru: "Среднее" },
    q_high:     { en: "High", zh: "高", ja: "高", ko: "높음", fr: "Haute", de: "Hoch", es: "Alta", ru: "Высокое" },
    q_original: { en: "Original", zh: "原圖", ja: "原本", ko: "원본", fr: "Originale", de: "Original", es: "Original", ru: "Оригинал" },
    wp_note:    { en: "Pick an image and it applies right away. Higher quality is sharper but stored larger.", zh: "選好圖片立即套用。畫質越高越清晰，但佔用空間也越大。", ja: "画像を選ぶとすぐ反映。高画質ほど鮮明ですが容量も大きくなります。", ko: "이미지를 고르면 바로 적용됩니다. 화질이 높을수록 선명하지만 용량이 큽니다.", fr: "L'image s'applique aussitôt. Plus la qualité est haute, plus c'est net mais lourd.", de: "Das Bild wird sofort angewendet. Höhere Qualität ist schärfer, aber größer.", es: "La imagen se aplica al instante. Más calidad es más nítida pero ocupa más.", ru: "Изображение применяется сразу. Выше качество — чётче, но больше размер." },

    // Chatbox panel
    cb_show: { en: "Chatbox window", zh: "對話框視窗", ja: "チャット窓", ko: "채팅창", fr: "Fenêtre de chat", de: "Chatfenster", es: "Ventana de chat", ru: "Окно чата" },
    scale:   { en: "Scale", zh: "縮放", ja: "拡大率", ko: "크기", fr: "Échelle", de: "Größe", es: "Escala", ru: "Масштаб" },
    cb_note: { en: "Turns the input into a window: 🔴 minimize · 🟡 restore · 🟢 maximize (Esc to exit). Drag the title bar to move, the edges to resize.", zh: "把輸入區變成視窗：🔴 縮小 · 🟡 還原 · 🟢 最大化（Esc 退出）。拖曳標題列移動，拖曳邊緣縮放。", ja: "入力欄を窓に：🔴 最小化 · 🟡 元に戻す · 🟢 最大化（Escで終了）。タイトルバーで移動、端でサイズ変更。", ko: "입력창을 창으로: 🔴 최소화 · 🟡 복원 · 🟢 최대화(Esc로 종료). 제목 표시줄로 이동, 가장자리로 크기 조절.", fr: "Fait de la saisie une fenêtre : 🔴 réduire · 🟡 restaurer · 🟢 agrandir (Échap pour quitter). Barre de titre pour déplacer, bords pour redimensionner.", de: "Macht die Eingabe zum Fenster: 🔴 verkleinern · 🟡 wiederherstellen · 🟢 maximieren (Esc zum Beenden). Titelleiste zum Verschieben, Ränder zum Skalieren.", es: "Convierte la entrada en ventana: 🔴 minimizar · 🟡 restaurar · 🟢 maximizar (Esc para salir). Arrastra la barra para mover, los bordes para redimensionar.", ru: "Превращает ввод в окно: 🔴 свернуть · 🟡 восстановить · 🟢 развернуть (Esc — выход). Тяните заголовок для перемещения, края — для размера." },

    // Pet panel
    pet_show: { en: "Show pet", zh: "顯示寵物", ja: "ペットを表示", ko: "펫 표시", fr: "Afficher le compagnon", de: "Haustier zeigen", es: "Mostrar mascota", ru: "Показать питомца" },
    pet_duck: { en: "Duck", zh: "小鴨", ja: "アヒル", ko: "오리", fr: "Canard", de: "Ente", es: "Pato", ru: "Утка" },
    pet_dog:  { en: "Dog", zh: "小狗", ja: "犬", ko: "강아지", fr: "Chien", de: "Hund", es: "Perro", ru: "Пёс" },
    pet_fox:  { en: "Fox", zh: "小狐狸", ja: "キツネ", ko: "여우", fr: "Renard", de: "Fuchs", es: "Zorro", ru: "Лиса" },
    pet_note: { en: "Drag the pet anywhere — it stays where you drop it.", zh: "把寵物拖到任何地方，放開後就留在那裡。", ja: "ペットを好きな場所にドラッグ。離した位置にとどまります。", ko: "펫을 아무 곳에나 끌어다 놓으면 그 자리에 머뭅니다.", fr: "Déplacez le compagnon où vous voulez — il reste où vous le lâchez.", de: "Zieh das Haustier irgendwohin – es bleibt, wo du es ablegst.", es: "Arrastra la mascota a cualquier lugar; se queda donde la sueltes.", ru: "Перетащите питомца куда угодно — он останется на месте." },

    // Font panel
    font_latin: { en: "Latin font", zh: "英文字體", ja: "欧文フォント", ko: "라틴 폰트", fr: "Police latine", de: "Lateinische Schrift", es: "Fuente latina", ru: "Латинский шрифт" },
    font_cjk:   { en: "Chinese font", zh: "中文字體", ja: "中文フォント", ko: "중문 폰트", fr: "Police chinoise", de: "CJK-Schrift", es: "Fuente china", ru: "Китайский шрифт" },
    font_note:  { en: "Applies to chat text instantly. Latin is used first, Chinese fills in for 中文 characters.", zh: "立即套用到對話文字。優先使用英文字體，中文字元則以中文字體補足。", ja: "チャット文字にすぐ反映。欧文を優先し、中文文字は中文フォントで補います。", ko: "채팅 글자에 즉시 적용됩니다. 라틴을 먼저 쓰고 중문 글자는 중문 폰트로 채웁니다.", fr: "S'applique aussitôt au chat. Le latin d'abord, le chinois pour les caractères 中文.", de: "Wirkt sofort im Chat. Zuerst Latein, Chinesisch für 中文-Zeichen.", es: "Se aplica al instante. Primero el latino; el chino para los caracteres 中文.", ru: "Применяется сразу. Сначала латиница, китайский — для иероглифов 中文." },

    // Settings panel
    s_dim:     { en: "Dim", zh: "暗度", ja: "暗さ", ko: "어둡게", fr: "Obscur.", de: "Dunkel", es: "Oscuro", ru: "Затемн." },
    s_blur:    { en: "Blur", zh: "模糊", ja: "ぼかし", ko: "흐림", fr: "Flou", de: "Unschärfe", es: "Desenf.", ru: "Размытие" },
    s_bright:  { en: "Bright", zh: "亮度", ja: "明るさ", ko: "밝기", fr: "Lumin.", de: "Hell", es: "Brillo", ru: "Яркость" },
    s_glass:   { en: "Glass", zh: "玻璃", ja: "ガラス", ko: "유리", fr: "Verre", de: "Glas", es: "Cristal", ru: "Стекло" },
    s_tint:    { en: "Glass tint", zh: "玻璃色調", ja: "ガラスの色", ko: "유리 색조", fr: "Teinte du verre", de: "Glasfarbe", es: "Tinte del cristal", ru: "Оттенок стекла" },
    s_auto:    { en: "Auto", zh: "自動", ja: "自動", ko: "자동", fr: "Auto", de: "Auto", es: "Auto", ru: "Авто" },
    s_reset:   { en: "Reset all settings", zh: "重設所有設定", ja: "すべてリセット", ko: "모든 설정 초기화", fr: "Tout réinitialiser", de: "Alles zurücksetzen", es: "Restablecer todo", ru: "Сбросить всё" },
    s_confirm: { en: "Tap again to confirm", zh: "再點一次以確認", ja: "もう一度タップで確定", ko: "한 번 더 눌러 확인", fr: "Retapez pour confirmer", de: "Zum Bestätigen erneut tippen", es: "Toca otra vez para confirmar", ru: "Нажмите ещё раз для подтверждения" },
    s_lang:    { en: "Language", zh: "語言", ja: "言語", ko: "언어", fr: "Langue", de: "Sprache", es: "Idioma", ru: "Язык" },
    s_cycle:   { en: "Tap to cycle", zh: "點擊切換", ja: "タップで切替", ko: "탭하여 전환", fr: "Toucher pour changer", de: "Tippen zum Wechseln", es: "Toca para cambiar", ru: "Нажмите для смены" },
    cs_styling: { en: "Code styling", zh: "程式碼樣式", ja: "コード表示", ko: "코드 스타일", fr: "Style du code", de: "Code-Stil", es: "Estilo de código", ru: "Стиль кода" },
    cs_default: { en: "Default code look", zh: "預設程式碼外觀", ja: "コードの既定スタイル", ko: "코드 기본 스타일", fr: "Style de code par défaut", de: "Standard-Code-Stil", es: "Estilo de código pred.", ru: "Стиль кода по умолч." },
    cs_note:    { en: "Applies to every code block you haven't styled individually.", zh: "套用到所有你沒有個別設定的程式碼區塊。", ja: "個別に設定していないすべてのコードブロックに適用されます。", ko: "개별적으로 설정하지 않은 모든 코드 블록에 적용됩니다.", fr: "S'applique à tous les blocs de code que vous n'avez pas personnalisés.", de: "Gilt für alle Codeblöcke, die du nicht einzeln angepasst hast.", es: "Se aplica a todos los bloques de código que no hayas personalizado.", ru: "Применяется ко всем блокам кода, которые вы не настроили отдельно." },

    // About panel
    ab_p1:       { en: "Gemini is powerful, but the interface is always the same — a monotonous background, fixed layout, missing a bit of your exclusive style.", zh: "Gemini 很強大，但介面卻千篇一律——單調的背景、固定的排版，少了點你的專屬風格。", ja: "Geminiは強力ですが、インターフェースは千篇一律です——単調な背景、固定のレイアウトで、あなただけのスタイルが少し足りません。", ko: "Gemini는 강력하지만 인터페이스는 천편일률적입니다——단조로운 배경, 고정된 레이아웃으로 당신만의 스타일이 조금 부족합니다.", fr: "Gemini est puissant, mais l'interface est toujours la même : un fond monotone, une mise en page fixe, il lui manque un peu de votre style exclusif.", de: "Gemini ist leistungsstark, aber die Benutzeroberfläche ist immer gleich — ein eintöniger Hintergrund, ein festes Layout, es fehlt ein wenig dein persönlicher Stil.", es: "Gemini es potente, pero la interfaz es siempre la misma: un fondo monótono, un diseño fijo, le falta un poco de tu estilo exclusivo.", ru: "Gemini мощный, но интерфейс однообразен — монотонный фон, фиксированный макет, не хватает немного вашего уникального стиля." },
    ab_p2:       { en: "This extension puts you back in control: apply your exclusive wallpaper, customize your favorite fonts, create a stunning glass texture, and supplement the reading tools missing from the official version, like highlighters and sticky notes.", zh: "這款擴充功能將主導權交還給你：換上專屬桌布、自訂喜歡的字體、打造絕美玻璃質感，更補足了官方缺少的螢光筆和便利貼等等閱讀工具。", ja: "この拡張機能は主導権をあなたに返します：専用の壁紙に変更し、お気に入りのフォントをカスタマイズし、美しいガラスの質感をひきだします。さらに、公式には欠けている蛍光ペンや付箋などの読書ツールを補完します。", ko: "이 확장 프로그램은 주도권을 당신에게 돌려줍니다: 전용 배경화면으로 변경하고, 좋아하는 글꼴을 사용자 정의하고, 아름다운 유리 질감을 만듭니다. 또한 공식 버전에는 없는 형광펜 및 포스트잇과 같은 읽기 도구를 보완합니다.", fr: "Cette extension vous redonne le contrôle : appliquez votre propre fond d'écran, personnalisez vos polices préférées, créez une superbe texture en verre, et complétez avec les outils de lecture absents de la version officielle, comme les surligneurs et les notes adhésives.", de: "Diese Erweiterung gibt dir die Kontrolle zurück: Wende dein eigenes Hintergrundbild an, passe deine Lieblingsschriften an, kreiere eine wunderschöne Glastextur und ergänze Lese-Tools, die in der offiziellen Version fehlen, wie Textmarker und Haftnotizen.", es: "Esta extensión te devuelve el control: aplica tu propio fondo de pantalla, personaliza tus fuentes favoritas, crea una hermosa textura de cristal y complementa las herramientas de lectura que faltan en la versión oficial, como resaltadores y notas adhesivas.", ru: "Это расширение возвращает контроль вам: установите собственные обои, настройте любимые шрифты, создайте красивую стеклянную текстуру и дополните недостающие в официальной версии инструменты для чтения, такие как маркер и стикеры." },
    ab_p3:       { en: "Almost all functions and settings can be opened from this floating orb, keeping the page clean until you need them.", zh: "幾乎所有功能與設定都能從這顆懸浮球開啟，讓頁面在你需要之前保持清爽。", ja: "ほぼすべての機能と設定はこの浮かぶ球から開くことができ、必要になるまでページをすっきりと保ちます。", ko: "거의 모든 기능과 설정은 이 떠 있는 구슬에서 열 수 있어, 필요할 때까지 페이지를 깔끔하게 유지합니다.", fr: "Presque toutes les fonctions et paramètres peuvent être ouverts depuis cette orbe flottante, gardant la page épurée jusqu'à ce que vous en ayez besoin.", de: "Fast alle Funktionen und Einstellungen können über diese schwebende Kugel geöffnet werden, sodass die Seite übersichtlich bleibt, bis du sie brauchst.", es: "Casi todas las funciones y configuraciones se pueden abrir desde este orbe flotante, manteniendo la página limpia hasta que las necesites.", ru: "Почти все функции и настройки можно открыть из этого плавающего шара, сохраняя страницу чистой, пока они вам не понадобятся." },
    ab_github:   { en: "Star it on GitHub — Buddy-Lu/Gemini-wallpaper", zh: "在 GitHub 給顆星星吧 ! — Buddy-Lu/Gemini-wallpaper", ja: "GitHubでスターを — Buddy-Lu/Gemini-wallpaper", ko: "GitHub에서 별 주기 — Buddy-Lu/Gemini-wallpaper", fr: "Mettez une étoile sur GitHub — Buddy-Lu/Gemini-wallpaper", de: "Auf GitHub mit Stern markieren — Buddy-Lu/Gemini-wallpaper", es: "Dale una estrella en GitHub — Buddy-Lu/Gemini-wallpaper", ru: "Звезда на GitHub — Buddy-Lu/Gemini-wallpaper" },
    ab_features: { en: "Features · how to use", zh: "功能 · 使用方式", ja: "機能 · 使い方", ko: "기능 · 사용법", fr: "Fonctions · mode d'emploi", de: "Funktionen · Bedienung", es: "Funciones · cómo usar", ru: "Возможности · как пользоваться" },
    ab_share:    { en: "Made with 💜 — if you like it, tell your friends!", zh: "用 💜 製作——喜歡的話，告訴你的朋友吧！", ja: "💜 を込めて——気に入ったら友だちに教えてね！", ko: "💜 로 만들었어요——마음에 들면 친구에게 알려 주세요!", fr: "Fait avec 💜 — si vous aimez, parlez-en autour de vous !", de: "Mit 💜 gemacht - wenn's gefällt, erzähl es weiter!", es: "Hecho con 💜 — si te gusta, ¡cuéntaselo a tus amigos!", ru: "Сделано с 💜 — понравилось? Расскажите друзьям!" },
    ab_copy:     { en: "Copy share link", zh: "複製分享連結", ja: "共有リンクをコピー", ko: "공유 링크 복사", fr: "Copier le lien", de: "Link kopieren", es: "Copiar enlace", ru: "Копировать ссылку" },
    ab_copied:   { en: "Copied! ✓", zh: "已複製！✓", ja: "コピーしました！✓", ko: "복사됨! ✓", fr: "Copié ! ✓", de: "Kopiert! ✓", es: "¡Copiado! ✓", ru: "Скопировано! ✓" }
  };

  // Pull a string for the current language; fall back to English, then the key.
  function t(key) {
    const e = I18N[key];
    if (!e) return key;
    return e[state.lang] || e.en || key;
  }

  // Grid icons — order fixed to the guide. kind: toggle | wallpaper | pet | about | info
  // `key` indexes I18N for both the label and its "i_"-prefixed intro.
  const ITEMS = [
    { id: "enabled",           img: "wallpaper.png",   key: "wallpaper",   kind: "wallpaper" },
    { id: "petEnabled",        img: "pet.png",         key: "pet",         kind: "pet" },
    { id: "chatboxDraggable",  img: "chatbox.png",     key: "chatbox",     kind: "chatbox" },
    { id: "font",              img: "font.png",        key: "font",        kind: "font" },
    { id: "about",             img: "about.png",       key: "about",       kind: "about" },
    { id: "annotate",          img: "highlighter.png", key: "highlighter", kind: "info" },
    { id: "notesEnabled",      img: "notes.png",       key: "notes",       kind: "toggle" },
    { id: "bulkDeleteEnabled", img: "bulk.png",        key: "bulk",        kind: "toggle" },
    { id: "math",              img: "math.png",        key: "math",        kind: "info" },
    { id: "code",              img: "theme.png",       key: "code",        kind: "info" },
    { id: "hideChatEnabled",   img: "hide.png",        key: "hide",        kind: "toggle" },
    { id: "thinkingBuddy",     img: "buddy.png",       key: "buddy",       kind: "toggle" },
  ];
  const iconHtml = (it) => it.img
    ? `<img src="${ICO(it.img)}" alt="" draggable="false">`
    : it.icon;
  const itLabel = (it) => t(it.key);
  const itIntro = (it) => t("i_" + it.key);

  const ON_KEYS = ["enabled", "petEnabled", "chatboxDraggable", "notesEnabled", "bulkDeleteEnabled", "hideChatEnabled", "thinkingBuddy"];

  const SLIDERS = [
    { key: "overlayOpacity", labelKey: "s_dim",    min: 0,  max: 100, def: 50,  toUi: (v) => Math.round(v * 100), toStore: (v) => v / 100, unit: "%" },
    { key: "blur",           labelKey: "s_blur",   min: 0,  max: 20,  def: 0,   unit: "px" },
    { key: "brightness",     labelKey: "s_bright", min: 30, max: 130, def: 100, unit: "%" },
    { key: "glassOpacity",   labelKey: "s_glass",  min: 0,  max: 100, def: 45,  unit: "%" },
  ];
  const PETS = [["duck", "Duck"], ["dog", "Dog"], ["fox", "Fox"]];

  // Image-quality presets — applied at upload time (mirrors the popup). Higher
  // quality keeps more pixels but stores a bigger base64 blob.
  const QUALITY_PRESETS = {
    low:      { maxW: 1280, jpegQ: 0.75 },
    medium:   { maxW: 1920, jpegQ: 0.85 },
    high:     { maxW: 2560, jpegQ: 0.92 },
    original: null,   // raw file bytes, no re-encode (preserves transparency)
  };
  const QUALITY = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["original", "Original"]];

  // Font choices — mirror the toolbar popup exactly (value → button label).
  // content.js watches chatFont / cjkFont and applies them live.
  const LATIN_FONTS = [
    ["", "Default"], ["Inter", "Inter"], ["Merriweather", "Merriweather"],
    ["JetBrains Mono", "JB Mono"], ["Nunito", "Nunito"],
  ];
  const CJK_FONTS = [
    ["", "預設"], ["Noto Serif TC", "思源宋"], ["Noto Sans TC", "思源黑"],
    ["LXGW WenKai TC", "文楷"], ["Zen Old Mincho", "明朝"], ["Zen Maru Gothic", "圓黑"],
  ];

  let ball = null, glass = null, menu = null, backdrop = null, intro = null;
  let x = 24, y = 200;
  let dragging = false, moved = false, downX = 0, downY = 0, offX = 0, offY = 0;
  let idleTimer = null, menuOpen = false, view = "home", infoItem = null;
  const state = {};

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ── Style ─────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById("gwp-as-style")) return;
    const st = document.createElement("style");
    st.id = "gwp-as-style";
    const orbitronUrl = chrome.runtime.getURL("assets/fonts/Orbitron.ttf");
    st.textContent = `
      /* Orbitron (SIL OFL) — bundled locally; used for the About title. */
      @font-face {
        font-family: 'Orbitron';
        src: url('${orbitronUrl}') format('truetype');
        font-weight: 400 900;
        font-display: swap;
      }
      @keyframes gwp-as-spin  { to { transform: rotate(360deg); } }
      @keyframes gwp-as-hue   { 0%,100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(45deg); } }
      @keyframes gwp-as-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      @keyframes gwp-as-pop { 0% { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }

      #gwp-as-ball {
        position: fixed; z-index: 2147482000; width: ${SIZE}px; height: ${SIZE}px;
        cursor: grab; opacity: 1; touch-action: none;
        transition: left .34s cubic-bezier(.22,1,.36,1), top .34s cubic-bezier(.22,1,.36,1), opacity .45s ease, transform .12s ease;
      }
      #gwp-as-ball.gwp-as-dragging { transition: opacity .2s, transform .12s; cursor: grabbing; }
      #gwp-as-ball.gwp-as-idle { opacity: .42; }
      #gwp-as-ball:active { transform: scale(.9); }
      #gwp-as-ball .gwp-as-glass {
        width: 100%; height: 100%; border-radius: 50%; pointer-events: none;
        background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.2), rgba(10,10,22,.18) 72%);
        box-shadow:
          inset 0 0 8px #ffffff,
          inset 4px 0 12px #ee82ee, inset -4px 0 12px #00ffff,
          inset 4px 0 44px #ee82ee, inset -4px 0 44px #00ffff,
          0 0 6px #ffffff, -5px 0 18px #ee82ee, 5px 0 18px #00ffff;
        animation: gwp-as-spin 5s linear infinite, gwp-as-hue 2.4s ease-in-out infinite, gwp-as-breathe 3.6s ease-in-out infinite;
      }

      #gwp-as-backdrop {
        position: fixed; inset: 0; z-index: 2147482400; background: rgba(6,7,16,.28);
        opacity: 0; transition: opacity .22s ease; backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px);
      }
      #gwp-as-backdrop.gwp-as-show { opacity: 1; }

      #gwp-as-menu {
        position: fixed; z-index: 2147482500; width: 270px; padding: 12px;
        border-radius: 24px; background: rgba(24,26,40,.74);
        backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
        border: 1px solid rgba(255,255,255,.14); box-shadow: 0 18px 55px rgba(0,0,0,.55);
        color: #eef1ff; font-family: 'Segoe UI', system-ui, sans-serif;
        transform: scale(.35); opacity: 0; transform-origin: var(--gwp-ox, 100%) var(--gwp-oy, 100%);
        transition: transform .3s cubic-bezier(.2,1.25,.32,1), opacity .2s ease;
      }
      #gwp-as-menu.gwp-as-open { transform: scale(1); opacity: 1; }

      #gwp-as-menu .gwp-as-head { display:flex; align-items:center; gap:8px; margin: 2px 4px 8px; }
      #gwp-as-menu .gwp-as-title { font-size: 13px; font-weight: 700; letter-spacing:.3px; flex:1; }
      #gwp-as-menu .gwp-as-back { background: transparent; border:none; color:#9fb4ff; cursor:pointer; font-size:16px; font-weight:700; padding:0 4px; }

      /* Intro tooltip — positioned right on the hovered icon. */
      #gwp-as-menu .gwp-as-intro {
        position: absolute; z-index: 5; pointer-events:none; max-width: 200px;
        background: rgba(12,14,26,.97); border:1px solid rgba(255,255,255,.16); border-radius:11px;
        padding: 8px 11px; box-shadow: 0 8px 22px rgba(0,0,0,.55);
        opacity: 0; transform: translateY(-3px); transition: opacity .13s, transform .13s;
      }
      #gwp-as-menu .gwp-as-intro.show { opacity: 1; transform: translateY(0); }
      #gwp-as-menu .gwp-as-intro b { display:block; font-size:12px; margin-bottom:2px; }
      #gwp-as-menu .gwp-as-intro span { font-size: 11px; opacity:.82; line-height:1.35; }

      #gwp-as-menu .gwp-as-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 4px;
        max-height: 238px; overflow-y: auto; padding: 4px 2px; scrollbar-width: thin;
      }
      #gwp-as-menu .gwp-as-grid::-webkit-scrollbar { width: 6px; }
      #gwp-as-menu .gwp-as-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }

      #gwp-as-menu .gwp-as-item {
        display:flex; flex-direction:column; align-items:center; gap:5px; border:none; cursor:pointer;
        background:transparent; color:inherit; padding:2px 0; border-radius:12px; animation: gwp-as-pop .3s backwards;
      }
      /* Light tile so the (mostly dark line-art) icons stay visible; the
         "on" state is a blue ring/glow, not a fill that would hide the icon. */
      #gwp-as-menu .gwp-as-ic {
        width: 50px; height: 50px; border-radius: 15px; display:flex; align-items:center; justify-content:center;
        font-size: 22px; background: #f1f3fa; border: 1px solid rgba(255,255,255,.5);
        transition: box-shadow .16s, transform .12s; overflow: hidden;
      }
      #gwp-as-menu .gwp-as-ic img { width: 28px; height: 28px; object-fit: contain; pointer-events: none; display:block; }
      #gwp-as-menu .gwp-as-item:hover .gwp-as-ic { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.35); }
      #gwp-as-menu .gwp-as-item.on .gwp-as-ic {
        box-shadow: 0 0 0 2px #6aa0ff, 0 6px 16px rgba(90,120,255,.5);
      }
      #gwp-as-menu .gwp-as-lbl { font-size: 10px; opacity: .82; text-align:center; }

      /* settings — a rounded-rectangle button below the grid (NOT a circle). */
      #gwp-as-menu .gwp-as-settings {
        width:100%; margin-top:10px; padding:11px; border:none; border-radius:14px; cursor:pointer;
        background: rgba(255,255,255,.10); color:#eef1ff; font-size:13px; font-weight:600; transition: background .15s;
        display:flex; align-items:center; justify-content:center; gap:8px;
      }
      #gwp-as-menu .gwp-as-settings:hover { background: rgba(122,155,255,.42); }
      #gwp-as-menu .gwp-as-settings img { width:18px; height:18px; object-fit:contain; }

      #gwp-as-menu .gwp-as-row { display:flex; align-items:center; gap:10px; margin: 9px 4px; }
      #gwp-as-menu .gwp-as-row label { flex: 0 0 52px; font-size: 11px; opacity: .8; }
      #gwp-as-menu .gwp-as-row input[type=range] { flex: 1; accent-color: #7a9bff; cursor: pointer; }
      #gwp-as-menu .gwp-as-row .gwp-as-val { flex: 0 0 34px; text-align:right; font-size: 11px; font-weight:600; color:#9fb4ff; }
      #gwp-as-menu .gwp-as-btn {
        width:100%; margin-top:8px; padding:10px; border:none; border-radius:13px; cursor:pointer;
        background: rgba(255,255,255,.10); color:#eef1ff; font-size:12px; font-weight:600; transition: background .15s;
        display:flex; align-items:center; justify-content:center; gap:8px;
      }
      #gwp-as-menu .gwp-as-btn:hover { background: rgba(122,155,255,.42); }
      #gwp-as-menu .gwp-as-seg { display:flex; gap:6px; margin: 10px 4px; }
      #gwp-as-menu .gwp-as-seg button {
        flex:1; padding:9px 0; border-radius:11px; border:1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06); color:#dfe4f7; font-size:12px; font-weight:600; cursor:pointer; transition: all .15s;
      }
      #gwp-as-menu .gwp-as-seg button.on { background: linear-gradient(160deg,#6aa0ff,#7a5cff); border-color: transparent; box-shadow: 0 5px 14px rgba(90,120,255,.4); }
      #gwp-as-menu .gwp-as-seg.wrap { flex-wrap: wrap; }
      #gwp-as-menu .gwp-as-seg.wrap button { flex: 1 0 40px; }

      /* Wallpaper preview thumbnail */
      #gwp-as-menu .gwp-as-preview {
        height: 92px; border-radius: 12px; margin: 10px 4px 4px;
        background-size: cover; background-position: center;
        border: 1px solid rgba(255,255,255,.14); box-shadow: inset 0 1px 3px rgba(0,0,0,.4);
      }
      #gwp-as-menu .gwp-as-preview.empty { background: rgba(255,255,255,.05); }
      /* danger button (reset) */
      #gwp-as-menu .gwp-as-btn.danger:hover { background: rgba(255,90,90,.35); }
      #gwp-as-menu .gwp-as-btn.armed { background: rgba(255,90,90,.4); color: #ffe1e1; }

      /* word-font pickers — wrapping chip rows */
      #gwp-as-menu .gwp-as-fld { margin: 12px 4px; }
      #gwp-as-menu .gwp-as-fld > .lab { display:block; font-size: 11px; opacity: .8; margin-bottom: 7px; }
      #gwp-as-menu .gwp-as-chips { display:flex; flex-wrap:wrap; gap: 6px; }
      #gwp-as-menu .gwp-as-chip {
        padding: 6px 11px; border-radius: 11px; border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06); color: #dfe4f7; font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all .15s;
      }
      #gwp-as-menu .gwp-as-chip:hover { background: rgba(255,255,255,.14); }
      #gwp-as-menu .gwp-as-chip.on { background: linear-gradient(160deg,#6aa0ff,#7a5cff); border-color: transparent; box-shadow: 0 5px 14px rgba(90,120,255,.4); }
      #gwp-as-menu .gwp-as-tint { display:flex; align-items:center; gap:10px; margin: 10px 4px; font-size:11px; opacity:.85; }
      #gwp-as-menu input[type=color] { width:26px; height:22px; border:none; border-radius:5px; background:none; cursor:pointer; padding:0; }
      #gwp-as-menu .gwp-as-note { font-size:11px; opacity:.7; line-height:1.5; margin: 6px 6px 2px; }
      #gwp-as-menu .gwp-as-switch { display:flex; align-items:center; justify-content:space-between; margin: 8px 4px; }
      #gwp-as-menu .gwp-as-switch .lab { font-size:12px; font-weight:600; }
      /* iOS-style sliding toggle — stays a <button> toggling .on, so the JS is untouched. */
      #gwp-as-menu .gwp-as-pill { box-sizing:border-box; position:relative; flex:none; width:50px; height:30px; padding:0; border:1px solid rgba(255,255,255,.18); border-radius:60px; background:rgba(255,255,255,.16); font-size:0; cursor:pointer; transition:background .35s cubic-bezier(.54,1.6,.5,1); }
      #gwp-as-menu .gwp-as-pill::after { content:""; position:absolute; top:1px; left:1px; width:26px; height:26px; border-radius:60px; background:#f5f5f7; box-shadow:0 0 0 1px hsla(0,0%,0%,.1), 0 4px 0 0 hsla(0,0%,0%,.04), 0 4px 9px hsla(0,0%,0%,.13), 0 3px 3px hsla(0,0%,0%,.05); transition:.35s cubic-bezier(.54,1.6,.5,1); }
      #gwp-as-menu .gwp-as-pill.on { background:#2ecc71; } #gwp-as-menu .gwp-as-pill.on::after { left:21px; }
      #gwp-as-menu .gwp-as-pill.off { background: rgba(255,255,255,.16); }
      #gwp-as-menu .gwp-as-hero { display:flex; flex-direction:column; align-items:center; gap:8px; padding: 6px 4px 2px; text-align:center; }
      #gwp-as-menu .gwp-as-hero .big { font-size: 40px; width:56px; height:56px; border-radius:15px; background:#f1f3fa; display:flex; align-items:center; justify-content:center; }
      #gwp-as-menu .gwp-as-hero .big img { width:36px; height:36px; object-fit:contain; }
      /* Live CSS glowing orb for the About hero (same look as the ball). */
      #gwp-as-menu .gwp-as-hero-orb {
        width: 92px; height: 92px; border-radius: 50%; margin: 4px 0 2px;
        background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.2), rgba(10,10,22,.18) 72%);
        box-shadow:
          inset 0 0 14px #ffffff,
          inset 7px 0 20px #ee82ee, inset -7px 0 20px #00ffff,
          inset 7px 0 74px #ee82ee, inset -7px 0 74px #00ffff,
          0 0 10px #ffffff, -8px 0 30px #ee82ee, 8px 0 30px #00ffff;
        animation: gwp-as-spin 5s linear infinite, gwp-as-hue 2.4s ease-in-out infinite, gwp-as-breathe 3.6s ease-in-out infinite;
      }

      /* README / About page — widened so text isn't cramped. */
      #gwp-as-menu.gwp-as-wide { width: 400px; }
      #gwp-as-menu .gwp-as-doc { max-height: 62vh; overflow-y: auto; padding: 2px 6px 2px 4px; scrollbar-width: thin; }
      #gwp-as-menu .gwp-as-doc::-webkit-scrollbar { width: 6px; }
      #gwp-as-menu .gwp-as-doc::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }
      #gwp-as-menu .gwp-as-about-intro {
        font-size:12px; opacity:.9; line-height:1.62; margin: 6px 4px 14px;
        padding: 14px 15px; background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.10); border-radius: 16px;
      }
      #gwp-as-menu .gwp-as-about-intro p { margin: 0 0 10px; }
      #gwp-as-menu .gwp-as-about-intro p:last-child { margin-bottom: 0; }
      #gwp-as-menu .gwp-as-gh {
        display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none;
        margin: 2px 2px 8px; padding:10px; border-radius:12px; color:#eef1ff; font-size:12px; font-weight:600;
        background: linear-gradient(160deg,#3a3f52,#22252f); border:1px solid rgba(255,255,255,.14); transition: filter .15s;
      }
      #gwp-as-menu .gwp-as-gh:hover { filter: brightness(1.2); }
      #gwp-as-menu .gwp-as-seclbl { font-size:10px; letter-spacing:1px; text-transform:uppercase; opacity:.5; margin: 10px 4px 6px; }
      #gwp-as-menu .gwp-as-feat { display:flex; gap:12px; align-items:flex-start; margin: 12px 3px; }
      #gwp-as-menu .gwp-as-feat .fic { flex:0 0 36px; width:36px; height:36px; border-radius:10px; background:#f1f3fa; display:flex; align-items:center; justify-content:center; font-size:18px; }
      #gwp-as-menu .gwp-as-feat .fic img { width:22px; height:22px; object-fit:contain; }
      #gwp-as-menu .gwp-as-feat .ftx b { font-size:12.5px; display:block; margin-bottom:3px; }
      #gwp-as-menu .gwp-as-feat .ftx span { font-size:11.5px; opacity:.8; line-height:1.52; }
      #gwp-as-menu .gwp-as-share {
        text-align:center; font-size:11px; opacity:.9; line-height:1.5; margin: 22px 4px 4px;
        padding: 12px 14px; background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.10); border-radius: 16px;
      }
      #gwp-as-menu .gwp-as-copy {
        margin: 6px auto 2px; display:block; border:none; border-radius:20px; padding:7px 18px; cursor:pointer;
        background: rgba(122,155,255,.25); color:#dfe6ff; font-size:11px; font-weight:700;
      }
      #gwp-as-menu .gwp-as-copy:hover { background: rgba(122,155,255,.45); }

      /* ── Settings: Apple bento grid ──────────────────────────
         Tokens borrowed from the apple-bento-grid skill and adapted to
         the orb's dark-glass theme: 6px gaps, 18px tile radius, cells
         stretch to fill (no empty gaps), a hero tile with a gradient
         top-border, and category accent colors. */
      #gwp-as-menu.gwp-as-mid { width: 336px; }
      #gwp-as-menu .gwp-as-bento {
        display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
        margin: 4px 2px 2px; align-items: stretch;
      }
      #gwp-as-menu .gwp-as-tile {
        --accent: #7a9bff;
        position: relative; display: flex; flex-direction: column; gap: 8px;
        padding: 14px; border-radius: 18px; text-align: left; border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06); color: #eef1ff; overflow: hidden;
        transition: background .16s, transform .12s, box-shadow .16s;
      }
      #gwp-as-menu button.gwp-as-tile, #gwp-as-menu a.gwp-as-tile { cursor: pointer; font: inherit; text-decoration: none; }
      #gwp-as-menu button.gwp-as-tile:hover, #gwp-as-menu a.gwp-as-tile:hover {
        background: rgba(255,255,255,.11); transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(0,0,0,.28);
      }
      #gwp-as-menu .gwp-as-tile.col2 { grid-column: span 2; }
      #gwp-as-menu .gwp-as-tile .t-lbl {
        font-size: 10px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700;
        opacity: .55; color: var(--accent); display: flex; align-items: center; gap: 6px;
      }
      #gwp-as-menu .gwp-as-tile .t-lbl::before {
        content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex: 0 0 7px;
      }
      #gwp-as-menu .gwp-as-tile .t-val { font-size: 18px; font-weight: 700; line-height: 1; }
      #gwp-as-menu .gwp-as-tile .t-sub { font-size: 11px; opacity: .7; line-height: 1.4; }

      /* Hero tile — gradient top accent + live mini orb. */
      #gwp-as-menu .gwp-as-tile.hero {
        flex-direction: row; align-items: center; gap: 12px; padding: 15px 16px;
        background: linear-gradient(150deg, rgba(122,155,255,.18), rgba(122,92,255,.10));
      }
      #gwp-as-menu .gwp-as-tile.hero::before {
        content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
        background: linear-gradient(90deg, #6aa0ff, #7a5cff, #ee82ee);
      }
      #gwp-as-menu .gwp-as-tile.hero .h-orb {
        width: 42px; height: 42px; border-radius: 50%; flex: 0 0 42px;
        background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.2), rgba(10,10,22,.18) 72%);
        box-shadow: inset 0 0 8px #fff, inset 5px 0 13px #ee82ee, inset -5px 0 13px #00ffff, 0 0 6px #fff;
        animation: gwp-as-spin 5s linear infinite, gwp-as-breathe 3.6s ease-in-out infinite;
      }
      #gwp-as-menu .gwp-as-tile.hero .h-name { font-size: 15px; font-weight: 700; }
      #gwp-as-menu .gwp-as-tile.hero .h-ver { font-size: 11px; opacity: .6; margin-top: 2px; }

      /* Segmented picker sitting inside a tile (language). */
      #gwp-as-menu .gwp-as-tile .t-seg { display: flex; flex-wrap: wrap; gap: 6px; }
      #gwp-as-menu .gwp-as-tile .t-seg button {
        padding: 6px 11px; border-radius: 11px; border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.05); color: #dfe4f7; font-size: 12px; font-weight: 600;
        cursor: pointer; transition: all .15s;
      }
      #gwp-as-menu .gwp-as-tile .t-seg button:hover { background: rgba(255,255,255,.13); }
      #gwp-as-menu .gwp-as-tile .t-seg button.on {
        background: linear-gradient(160deg,#6aa0ff,#7a5cff); border-color: transparent;
        box-shadow: 0 5px 14px rgba(90,120,255,.4); color: #fff;
      }

      /* Glass-tint swatch tile. */
      #gwp-as-menu .gwp-as-tile .t-swatch {
        width: 100%; height: 30px; border: none; border-radius: 10px; background: none;
        cursor: pointer; padding: 0; overflow: hidden; margin-top: auto;
      }
      #gwp-as-menu .gwp-as-tile .t-swatch::-webkit-color-swatch { border: 1px solid rgba(255,255,255,.2); border-radius: 10px; }
      #gwp-as-menu .gwp-as-tile .t-swatch::-webkit-color-swatch-wrapper { padding: 0; }

      /* Reset tile — danger accent; armed state turns solid red. */
      #gwp-as-menu .gwp-as-tile.danger { --accent: #ff6b6b; }
      #gwp-as-menu .gwp-as-tile.danger .t-val { color: #ff8f8f; font-size: 14px; }
      #gwp-as-menu .gwp-as-tile.danger.armed {
        background: rgba(255,80,80,.22); border-color: rgba(255,120,120,.5);
      }
      #gwp-as-menu .gwp-as-tile.danger.armed .t-val { color: #ffd0d0; }
      #gwp-as-menu .gwp-as-tile.link .t-star { position: absolute; top: 8px; right: 60px; color: #ffd76a; font-size: 15px; line-height: 1; }
      /* GitHub + Reset row: tighter tiles — star sits up by the label, boxes shrink. */
      #gwp-as-menu .gwp-as-tile.link, #gwp-as-menu .gwp-as-tile.danger { padding: 10px 13px; gap: 4px; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  // ── Ball ──────────────────────────────────────────────────
  function createBall() {
    if (ball) return;
    // Clear anything left by a previous content-script instance (e.g. after an
    // unpacked-extension reload) so we never stack a dead ball or an orphaned
    // click-blocking backdrop over the fresh one.
    document.querySelectorAll("#gwp-as-ball, #gwp-as-backdrop, #gwp-as-menu").forEach((el) => el.remove());
    injectStyle();
    ball = document.createElement("div");
    ball.id = "gwp-as-ball";
    ball.title = "Tap to open · drag to move";
    glass = document.createElement("div");
    glass.className = "gwp-as-glass";
    ball.appendChild(glass);
    ball.addEventListener("pointerdown", onDown);
    ball.addEventListener("pointerenter", wake);
    document.body.appendChild(ball);
    place();
    armIdle();
  }
  function removeBall() {
    closeMenu(true);
    ball?.remove(); ball = null; glass = null;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }
  function place() {
    if (!ball) return;
    x = clamp(x, EDGE, window.innerWidth - SIZE - EDGE);
    y = clamp(y, EDGE, window.innerHeight - SIZE - EDGE);
    ball.style.left = x + "px";
    ball.style.top = y + "px";
  }
  function armIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ball && !menuOpen && ball.classList.add("gwp-as-idle"), IDLE_MS);
  }
  function wake() { if (!ball) return; ball.classList.remove("gwp-as-idle"); armIdle(); }

  // ── Drag / tap ────────────────────────────────────────────
  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (dragging) onUp();            // recover from a lost pointerup
    e.preventDefault();
    wake();
    dragging = true; moved = false;
    downX = e.clientX; downY = e.clientY;
    const r = ball.getBoundingClientRect();
    offX = e.clientX - r.left; offY = e.clientY - r.top;
    ball.classList.add("gwp-as-dragging");
    try { ball.setPointerCapture?.(e.pointerId); } catch (_) {}
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  }
  function onMove(e) {
    if (!dragging) return;
    if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_PX) moved = true;
    x = e.clientX - offX; y = e.clientY - offY;
    place();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    ball.classList.remove("gwp-as-dragging");
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    if (moved) {
      const cx = x + SIZE / 2;
      x = cx < window.innerWidth / 2 ? EDGE : window.innerWidth - SIZE - EDGE;
      place();
      chrome.storage.local.set({ [KEY_POS]: { x, y } });
    } else {
      toggleMenu();
    }
    armIdle();
  }

  // ── Menu shell ────────────────────────────────────────────
  // Toggle off the live DOM, not the (potentially stale) menuOpen flag.
  function toggleMenu() {
    if (document.getElementById("gwp-as-menu") || document.getElementById("gwp-as-backdrop")) closeMenu();
    else openMenu();
  }
  // Remove any orphaned menu/backdrop nodes left behind by a torn-down render.
  function purgeMenu() {
    document.querySelectorAll("#gwp-as-backdrop, #gwp-as-menu").forEach((el) => el.remove());
    menu = null; backdrop = null; intro = null;
  }
  function openMenu() {
    if (!ball) return;
    purgeMenu();
    menuOpen = true; view = "home"; wake(); ball.classList.remove("gwp-as-idle");
    backdrop = document.createElement("div");
    backdrop.id = "gwp-as-backdrop";
    backdrop.addEventListener("pointerdown", () => closeMenu());
    document.body.appendChild(backdrop);
    menu = document.createElement("div");
    menu.id = "gwp-as-menu";
    document.body.appendChild(menu);
    try {
      renderMenu();
    } catch (err) {
      // A failed render must never leave an invisible click-blocking backdrop.
      closeMenu(true);
      return;
    }
    const bd = backdrop, mn = menu;
    requestAnimationFrame(() => { bd && bd.classList.add("gwp-as-show"); mn && mn.classList.add("gwp-as-open"); });
  }
  function closeMenu(immediate) {
    menuOpen = false;
    const m = menu, b = backdrop;
    menu = null; backdrop = null; intro = null;
    if (!m && !b) return;
    if (immediate) { m?.remove(); b?.remove(); armIdle(); return; }
    m?.classList.remove("gwp-as-open"); b?.classList.remove("gwp-as-show");
    setTimeout(() => { m?.remove(); b?.remove(); }, 260);
    armIdle();
  }
  function positionMenu() {
    if (!menu) return;
    const bw = menu.offsetWidth || 270, gap = 12;
    const r = ball.getBoundingClientRect();
    const openLeft = r.left + SIZE / 2 > window.innerWidth / 2;
    let left = openLeft ? r.left - bw - gap : r.right + gap;
    left = clamp(left, 8, window.innerWidth - bw - 8);
    const mh = menu.offsetHeight || 300;
    let top = clamp(r.top + SIZE / 2 - mh / 2, 8, window.innerHeight - mh - 8);
    menu.style.left = left + "px"; menu.style.top = top + "px";
    menu.style.setProperty("--gwp-ox", openLeft ? "100%" : "0%");
    menu.style.setProperty("--gwp-oy", clamp(r.top + SIZE / 2 - top, 0, mh) + "px");
  }
  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = "";
    // The About page needs room to breathe; Settings uses a medium width for
    // its bento grid; every other view stays compact.
    menu.classList.toggle("gwp-as-wide", view === "about");
    menu.classList.toggle("gwp-as-mid", view === "settings");
    if (view === "home") renderHome();
    else if (view === "settings") renderSettings();
    else if (view === "wallpaper") renderWallpaper();
    else if (view === "chatbox") renderChatbox();
    else if (view === "pet") renderPet();
    else if (view === "font") renderFont();
    else if (view === "about") renderAbout();
    else if (view === "info") renderInfo();
    positionMenu();
  }

  function header(title, withBack, backTo) {
    const h = document.createElement("div");
    h.className = "gwp-as-head";
    if (withBack) {
      const back = document.createElement("button");
      back.className = "gwp-as-back"; back.textContent = "‹";
      back.addEventListener("click", (e) => { e.stopPropagation(); view = backTo || "home"; renderMenu(); });
      h.appendChild(back);
    }
    const t = document.createElement("div");
    t.className = "gwp-as-title"; t.textContent = title;
    h.appendChild(t);
    return h;
  }

  // ── Home (grid + settings button) ─────────────────────────
  function renderHome() {
    menu.appendChild(header(t("assistant"), false));

    intro = document.createElement("div");
    intro.className = "gwp-as-intro";
    intro.innerHTML = `<b></b><span></span>`;
    menu.appendChild(intro);

    const grid = document.createElement("div");
    grid.className = "gwp-as-grid";
    ITEMS.forEach((it, i) => {
      const on = ON_KEYS.includes(it.id) && !!state[it.id];
      const item = document.createElement("button");
      item.className = "gwp-as-item" + (on ? " on" : "");
      item.style.animationDelay = (i * 22) + "ms";
      item.innerHTML = `<span class="gwp-as-ic">${iconHtml(it)}</span><span class="gwp-as-lbl">${itLabel(it)}</span>`;
      item.addEventListener("mouseenter", () => showIntro(it, item));
      item.addEventListener("mouseleave", hideIntro);
      item.addEventListener("click", (e) => { e.stopPropagation(); onItem(it, item); });
      grid.appendChild(item);
    });
    menu.appendChild(grid);

    const settings = document.createElement("button");
    settings.className = "gwp-as-settings";
    settings.innerHTML = `<img src="${ICO("settings.png")}" alt="" draggable="false"><span>${t("settings")}</span>`;
    settings.addEventListener("click", (e) => { e.stopPropagation(); view = "settings"; renderMenu(); });
    menu.appendChild(settings);
  }

  // Intro tooltip positioned right on the hovered icon.
  function showIntro(it, el) {
    if (!intro) return;
    intro.querySelector("b").textContent = itLabel(it);
    intro.querySelector("span").textContent = itIntro(it);
    intro.classList.add("show");
    const mr = menu.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const tw = intro.offsetWidth, th = intro.offsetHeight;
    let left = er.left - mr.left + er.width / 2 - tw / 2;
    left = clamp(left, 6, menu.clientWidth - tw - 6);
    let top = er.top - mr.top - th - 8;              // above the icon
    if (top < 4) top = er.bottom - mr.top + 8;       // flip below if no room
    intro.style.left = left + "px";
    intro.style.top = top + "px";
  }
  function hideIntro() { intro && intro.classList.remove("show"); }

  function onItem(it, el) {
    if (it.kind === "toggle") {
      const next = !state[it.id];
      state[it.id] = next;
      chrome.storage.local.set({ [it.id]: next });
      el.classList.toggle("on", next);
      return;
    }
    if (it.kind === "wallpaper") { view = "wallpaper"; renderMenu(); return; }
    if (it.kind === "chatbox")  { view = "chatbox"; renderMenu(); return; }
    if (it.kind === "pet")      { view = "pet"; renderMenu(); return; }
    if (it.kind === "font")     { view = "font"; renderMenu(); return; }
    if (it.kind === "about")    { view = "about"; renderMenu(); return; }
    if (it.kind === "info")     { infoItem = it; view = "info"; renderMenu(); return; }
  }

  function switchRow(labelText, key) {
    const row = document.createElement("div");
    row.className = "gwp-as-switch";
    const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = labelText;
    const pill = document.createElement("button");
    const paint = () => { const on = !!state[key]; pill.textContent = on ? "On" : "Off"; pill.className = "gwp-as-pill " + (on ? "on" : "off"); };
    paint();
    pill.addEventListener("click", (e) => { e.stopPropagation(); state[key] = !state[key]; chrome.storage.local.set({ [key]: state[key] }); paint(); });
    row.appendChild(lab); row.appendChild(pill);
    return row;
  }

  // ── Wallpaper sub-panel ───────────────────────────────────
  function renderWallpaper() {
    menu.appendChild(header(t("wallpaper"), true));
    menu.appendChild(switchRow(t("wp_show"), "enabled"));

    // Preview of the current wallpaper.
    const prev = document.createElement("div");
    prev.className = "gwp-as-preview" + (state.imageData ? "" : " empty");
    if (state.imageData) prev.style.backgroundImage = `url("${state.imageData}")`;
    menu.appendChild(prev);

    const up = document.createElement("button");
    up.className = "gwp-as-btn"; up.textContent = "🖼  " + t("wp_choose");
    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      file.value = "";                       // let the same file re-fire change
      if (f) processFile(f, prev);
    });
    up.addEventListener("click", (e) => { e.stopPropagation(); file.click(); });
    menu.appendChild(up); menu.appendChild(file);

    // Image-quality picker — applied on the next upload.
    const qlab = document.createElement("div");
    qlab.className = "gwp-as-seclbl"; qlab.textContent = t("wp_quality");
    menu.appendChild(qlab);
    const seg = document.createElement("div");
    seg.className = "gwp-as-seg wrap";
    QUALITY.forEach(([val]) => {
      const b = document.createElement("button");
      b.textContent = t("q_" + val);
      if ((state.imageQuality || "medium") === val) b.classList.add("on");
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        state.imageQuality = val;
        chrome.storage.local.set({ imageQuality: val });
        seg.querySelectorAll("button").forEach((z) => z.classList.remove("on"));
        b.classList.add("on");
      });
      seg.appendChild(b);
    });
    menu.appendChild(seg);

    const note = document.createElement("div");
    note.className = "gwp-as-note";
    note.textContent = t("wp_note");
    menu.appendChild(note);

    // Appearance — these all shape how the wallpaper reads, so they live here.
    const look = document.createElement("div");
    look.className = "gwp-as-seclbl"; look.textContent = t("wp_look");
    menu.appendChild(look);
    SLIDERS.forEach((sl) => menu.appendChild(sliderRow(sl)));
    menu.appendChild(tintRow());
  }

  // Glass-tint row: colour swatch + an "Auto" chip that samples the wallpaper.
  function tintRow() {
    const tint = document.createElement("div");
    tint.className = "gwp-as-tint";
    const tlab = document.createElement("span"); tlab.textContent = t("s_tint"); tlab.style.flex = "1";
    const color = document.createElement("input");
    color.type = "color"; color.value = state.glassColor || "#000000";
    color.addEventListener("input", (e) => { e.stopPropagation(); state.glassColor = color.value; chrome.storage.local.set({ glassColor: color.value }); });
    const auto = document.createElement("button");
    auto.className = "gwp-as-chip"; auto.textContent = t("s_auto");
    auto.addEventListener("click", (e) => { e.stopPropagation(); autoTint(color); });
    tint.appendChild(tlab); tint.appendChild(auto); tint.appendChild(color);
    return tint;
  }

  // Downscale + re-encode per the chosen quality, then store and preview.
  async function processFile(fileObj, prevEl) {
    if (!fileObj || !fileObj.type.startsWith("image/")) return;
    if (fileObj.size > 15 * 1024 * 1024) return;      // 15 MB guard
    const q = state.imageQuality || "medium";
    const preset = QUALITY_PRESETS.hasOwnProperty(q) ? QUALITY_PRESETS[q] : QUALITY_PRESETS.medium;
    let dataUrl;
    try {
      if (preset === null) {
        dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result); r.onerror = () => rej(r.error);
          r.readAsDataURL(fileObj);
        });
      } else {
        const objectUrl = URL.createObjectURL(fileObj);
        try {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objectUrl; });
          const scale = img.naturalWidth > preset.maxW ? preset.maxW / img.naturalWidth : 1;
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          const bitmap = await createImageBitmap(fileObj, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          bitmap.close();
          dataUrl = canvas.toDataURL("image/jpeg", preset.jpegQ);
        } finally { URL.revokeObjectURL(objectUrl); }
      }
    } catch (_) { return; }
    state.imageData = dataUrl; state.enabled = true;
    chrome.storage.local.set({ imageData: dataUrl, enabled: true });
    if (prevEl) { prevEl.style.backgroundImage = `url("${dataUrl}")`; prevEl.classList.remove("empty"); }
  }

  // ── Chatbox sub-panel ─────────────────────────────────────
  function renderChatbox() {
    menu.appendChild(header(t("chatbox"), true));
    menu.appendChild(switchRow(t("cb_show"), "chatboxDraggable"));
    menu.appendChild(sliderRow({ key: "chatboxScale", labelKey: "scale", min: 50, max: 150, step: 5, unit: "%" }));
    const note = document.createElement("div");
    note.className = "gwp-as-note";
    note.textContent = t("cb_note");
    menu.appendChild(note);
  }

  // ── Pet sub-panel ─────────────────────────────────────────
  function renderPet() {
    menu.appendChild(header(t("pet"), true));
    menu.appendChild(switchRow(t("pet_show"), "petEnabled"));
    const seg = document.createElement("div");
    seg.className = "gwp-as-seg";
    PETS.forEach(([val]) => {
      const b = document.createElement("button");
      b.textContent = t("pet_" + val);
      if (state.petType === val) b.classList.add("on");
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        state.petType = val; state.petEnabled = true;
        chrome.storage.local.set({ petType: val, petEnabled: true });
        seg.querySelectorAll("button").forEach((z) => z.classList.remove("on"));
        b.classList.add("on");
      });
      seg.appendChild(b);
    });
    menu.appendChild(seg);
    const note = document.createElement("div");
    note.className = "gwp-as-note"; note.textContent = t("pet_note");
    menu.appendChild(note);
  }

  // ── Word-font sub-panel ───────────────────────────────────
  function fontGroup(labelText, key, options) {
    const fld = document.createElement("div");
    fld.className = "gwp-as-fld";
    const lab = document.createElement("span");
    lab.className = "lab"; lab.textContent = labelText;
    fld.appendChild(lab);
    const chips = document.createElement("div");
    chips.className = "gwp-as-chips";
    options.forEach(([val, txt]) => {
      const b = document.createElement("button");
      b.className = "gwp-as-chip" + ((state[key] || "") === val ? " on" : "");
      b.textContent = txt;
      if (val) b.style.fontFamily = `'${val}'`;   // preview once the font is loaded
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        state[key] = val;
        chrome.storage.local.set({ [key]: val });
        chips.querySelectorAll("button").forEach((z) => z.classList.remove("on"));
        b.classList.add("on");
      });
      chips.appendChild(b);
    });
    fld.appendChild(chips);
    return fld;
  }
  function renderFont() {
    menu.appendChild(header(t("font"), true));
    menu.appendChild(fontGroup(t("font_latin"), "chatFont", LATIN_FONTS));
    menu.appendChild(fontGroup(t("font_cjk"), "cjkFont", CJK_FONTS));
    const note = document.createElement("div");
    note.className = "gwp-as-note";
    note.textContent = t("font_note");
    menu.appendChild(note);
  }

  // Build one labelled slider row. sl: { key, label, min, max, unit, step?,
  // toUi?, toStore? }. Shared by the settings and chatbox panels.
  function sliderRow(sl) {
    const raw = state[sl.key];
    const uiVal = sl.toUi ? sl.toUi(raw) : raw;
    const row = document.createElement("div");
    row.className = "gwp-as-row";
    const lab = document.createElement("label"); lab.textContent = sl.labelKey ? t(sl.labelKey) : sl.label;
    const range = document.createElement("input");
    range.type = "range"; range.min = sl.min; range.max = sl.max; range.value = uiVal;
    if (sl.step) range.step = sl.step;
    const val = document.createElement("span"); val.className = "gwp-as-val"; val.textContent = uiVal + sl.unit;
    range.addEventListener("input", (e) => {
      e.stopPropagation();
      const ui = parseInt(range.value, 10);
      val.textContent = ui + sl.unit;
      const store = sl.toStore ? sl.toStore(ui) : ui;
      state[sl.key] = store;
      chrome.storage.local.set({ [sl.key]: store });
    });
    row.appendChild(lab); row.appendChild(range); row.appendChild(val);
    return row;
  }

  // Sample the current wallpaper and pick its dominant color (weighted toward
  // saturated pixels, away from near-black/near-white). Mirrors the popup.
  function dominantColor(img) {
    const MAX = 64;
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 125) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (max + min) / 2;
      let weight = 1 + sat * 3;
      if (lum < 18 || lum > 240) weight *= 0.15;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let e = buckets.get(key);
      if (!e) { e = { r: 0, g: 0, b: 0, w: 0 }; buckets.set(key, e); }
      e.r += r * weight; e.g += g * weight; e.b += b * weight; e.w += weight;
    }
    let best = null;
    for (const e of buckets.values()) if (!best || e.w > best.w) best = e;
    if (!best) return null;
    const to = (n) => Math.round(n).toString(16).padStart(2, "0");
    return "#" + to(best.r / best.w) + to(best.g / best.w) + to(best.b / best.w);
  }

  function autoTint(colorInput) {
    if (!state.imageData) return;
    const img = new Image();
    img.onload = () => {
      const hex = dominantColor(img);
      if (!hex) return;
      if (colorInput) colorInput.value = hex;
      state.glassColor = hex;
      chrome.storage.local.set({ glassColor: hex });
    };
    img.src = state.imageData;
  }

  // Reset everything to defaults but keep the orb alive (its on-state and
  // position), so the panel you're standing in doesn't vanish mid-reset.
  function resetAll() {
    const KEEP = [KEY_ON, KEY_POS, "lang"];   // orb + chosen language survive a reset
    chrome.storage.local.get(null, (all) => {
      const drop = Object.keys(all).filter((k) => !KEEP.includes(k));
      chrome.storage.local.remove(drop, () => {
        const seed = {};
        Object.keys(DEFAULTS).forEach((k) => { if (!KEEP.includes(k)) seed[k] = DEFAULTS[k]; });
        chrome.storage.local.set(seed, () => {
          Object.assign(state, seed);
          view = "home"; renderMenu();
        });
      });
    });
  }

  // ── Settings sub-panel ────────────────────────────────────
  // Settings as an Apple-style bento grid: a hero identity tile, then real,
  // wired controls arranged in stretch-filled cells (no empty gaps).
  function renderSettings() {
    menu.appendChild(header(t("settings"), true));

    const bento = document.createElement("div");
    bento.className = "gwp-as-bento";

    // Hero (span 2) — live mini orb + name + version, gradient top accent.
    const hero = document.createElement("div");
    hero.className = "gwp-as-tile hero col2";
    let ver = "";
    try { ver = "v" + chrome.runtime.getManifest().version; } catch (_) {}
    hero.innerHTML =
      `<div class="h-orb"></div>` +
      `<div><div class="h-name">Gemini Wallpaper</div><div class="h-ver">${ver}</div></div>`;
    bento.appendChild(hero);

    // Language (span 2) — segmented; re-render in place so the switch is instant.
    const langT = document.createElement("div");
    langT.className = "gwp-as-tile col2";
    const llab = document.createElement("div"); llab.className = "t-lbl"; llab.textContent = t("s_lang");
    const lseg = document.createElement("div"); lseg.className = "t-seg";
    LANGS.forEach(([val, txt]) => {
      const b = document.createElement("button");
      b.textContent = txt;
      if ((state.lang || "en") === val) b.classList.add("on");
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        state.lang = val;
        chrome.storage.local.set({ lang: val });
        renderMenu();               // stays on settings, now translated
      });
      lseg.appendChild(b);
    });
    langT.append(llab, lseg);
    bento.appendChild(langT);

    // Image quality — tap the tile to cycle low → medium → high → original.
    const qT = document.createElement("button");
    qT.className = "gwp-as-tile"; qT.style.setProperty("--accent", "#ffb454");
    const curQ = () => state.imageQuality || "medium";
    const qval = document.createElement("div"); qval.className = "t-val"; qval.textContent = t("q_" + curQ());
    qT.innerHTML = `<div class="t-lbl">${t("wp_quality")}</div>`;
    const qsub = document.createElement("div"); qsub.className = "t-sub"; qsub.textContent = t("s_cycle");
    qT.append(qval, qsub);
    qT.addEventListener("click", (e) => {
      e.stopPropagation();
      const vals = QUALITY.map(([v]) => v);
      const next = vals[(vals.indexOf(curQ()) + 1) % vals.length];
      state.imageQuality = next;
      chrome.storage.local.set({ imageQuality: next });
      qval.textContent = t("q_" + next);
    });
    bento.appendChild(qT);

    // Glass tint — colour swatch; the tile's accent dot follows the chosen colour.
    const gT = document.createElement("div");
    gT.className = "gwp-as-tile"; gT.style.setProperty("--accent", state.glassColor || "#7a9bff");
    const swatch = document.createElement("input");
    swatch.type = "color"; swatch.className = "t-swatch"; swatch.value = state.glassColor || "#000000";
    swatch.addEventListener("click", (e) => e.stopPropagation());
    swatch.addEventListener("input", (e) => {
      e.stopPropagation();
      state.glassColor = swatch.value;
      chrome.storage.local.set({ glassColor: swatch.value });
      gT.style.setProperty("--accent", swatch.value);
    });
    gT.innerHTML = `<div class="t-lbl">${t("s_tint")}</div>`;
    gT.appendChild(swatch);
    bento.appendChild(gT);

    // GitHub — link tile (label + star + repo path, all language-neutral).
    const ghT = document.createElement("a");
    ghT.className = "gwp-as-tile link"; ghT.style.setProperty("--accent", "#ffd76a");
    ghT.href = GITHUB; ghT.target = "_blank"; ghT.rel = "noopener noreferrer";
    ghT.addEventListener("click", (e) => e.stopPropagation());
    ghT.innerHTML = `<div class="t-lbl">GitHub<span class="t-star">★</span></div><div class="t-sub">Buddy-Lu/Gemini-wallpaper</div>`;
    bento.appendChild(ghT);

    // Reset — danger tile; two-tap confirm so it can't be hit by accident.
    const reset = document.createElement("button");
    reset.className = "gwp-as-tile danger";
    const rval = document.createElement("div"); rval.className = "t-val"; rval.textContent = t("s_reset");
    reset.appendChild(rval);
    let armed = false, armTimer = null;
    reset.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!armed) {
        armed = true; reset.classList.add("armed"); rval.textContent = t("s_confirm");
        armTimer = setTimeout(() => { armed = false; reset.classList.remove("armed"); rval.textContent = t("s_reset"); }, 2600);
        return;
      }
      clearTimeout(armTimer);
      resetAll();
    });
    bento.appendChild(reset);

    menu.appendChild(bento);
  }

  // ── Default code-block look (writes `codeStyle`) ──────────────
  // Rendered inside the Code Theme feature card so users set their default
  // preference right where the feature is described.
  // Control labels stay English to match the per-block code panel (code-style.js).
  function renderCodeControls() {
    const cs = state.codeStyle = { ...CODE_DEFAULTS, ...state.codeStyle };
    const save = () => chrome.storage.local.set({ codeStyle: state.codeStyle });

    // On/Off at the top too, for convenience.
    const sw = document.createElement("div"); sw.className = "gwp-as-switch";
    const swLab = document.createElement("span"); swLab.className = "lab"; swLab.textContent = t("cs_styling");
    const swPill = document.createElement("button");
    const paint = () => { const on = !!state.codeStyleEnabled; swPill.textContent = on ? "On" : "Off"; swPill.className = "gwp-as-pill " + (on ? "on" : "off"); };
    paint();
    swPill.addEventListener("click", (e) => { e.stopPropagation(); state.codeStyleEnabled = !state.codeStyleEnabled; chrome.storage.local.set({ codeStyleEnabled: state.codeStyleEnabled }); paint(); });
    sw.append(swLab, swPill); menu.appendChild(sw);

    menu.appendChild(codeSeg("Border", "border", [["none", "None"], ["solid", "Border"], ["shiny", "Shiny"], ["synthwave", "Synthwave"]], save));
    menu.appendChild(codeSeg("Font", "font", [["", "Default"], ["JetBrains Mono", "JetBrains"], ["Fira Code", "Fira"], ["Source Code Pro", "Source"], ["IBM Plex Mono", "IBM"]], save));
    menu.appendChild(codeSlider("Font size", "fontSize", 10, 22, 1, "px", save));

    const ln = document.createElement("div"); ln.className = "gwp-as-switch";
    const lnLab = document.createElement("span"); lnLab.className = "lab"; lnLab.textContent = "Line numbers";
    const lnPill = document.createElement("button");
    const paintLn = () => { lnPill.textContent = cs.lineNumbers ? "On" : "Off"; lnPill.className = "gwp-as-pill " + (cs.lineNumbers ? "on" : "off"); };
    paintLn();
    lnPill.addEventListener("click", (e) => { e.stopPropagation(); cs.lineNumbers = !cs.lineNumbers; save(); paintLn(); });
    ln.append(lnLab, lnPill); menu.appendChild(ln);

    const tint = document.createElement("div"); tint.className = "gwp-as-tint";
    const tLab = document.createElement("span"); tLab.textContent = "Tint"; tLab.style.flex = "1";
    const tColor = document.createElement("input"); tColor.type = "color"; tColor.value = cs.tintColor || "#0f1020";
    tColor.addEventListener("input", (e) => { e.stopPropagation(); cs.tintColor = tColor.value; save(); });
    tint.append(tLab, tColor); menu.appendChild(tint);

    menu.appendChild(codeSlider("Opacity", "tintOpacity", 0, 100, 1, "%", save));
    menu.appendChild(codeSlider("Blur", "blur", 0, 24, 1, "px", save));
    menu.appendChild(codeSlider("Radius", "radius", 0, 28, 1, "px", save));

    const note = document.createElement("div");
    note.className = "gwp-as-note"; note.textContent = t("cs_note");
    menu.appendChild(note);
  }
  // Slider bound to a field of state.codeStyle (not a flat state key).
  function codeSlider(label, field, min, max, step, unit, save) {
    const cs = state.codeStyle;
    const row = document.createElement("div"); row.className = "gwp-as-row";
    const lab = document.createElement("label"); lab.textContent = label;
    const range = document.createElement("input");
    range.type = "range"; range.min = min; range.max = max; range.step = step; range.value = cs[field];
    const val = document.createElement("span"); val.className = "gwp-as-val"; val.textContent = cs[field] + unit;
    range.addEventListener("input", (e) => {
      e.stopPropagation();
      const v = parseInt(range.value, 10);
      val.textContent = v + unit; cs[field] = v; save();
    });
    row.append(lab, range, val); return row;
  }
  // Wrapping chip picker bound to a field of state.codeStyle.
  function codeSeg(label, field, options, save) {
    const cs = state.codeStyle;
    const wrap = document.createElement("div"); wrap.className = "gwp-as-fld";
    const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = label; wrap.appendChild(lab);
    const chips = document.createElement("div"); chips.className = "gwp-as-chips";
    options.forEach(([val, text]) => {
      const b = document.createElement("button");
      b.className = "gwp-as-chip" + (cs[field] === val ? " on" : ""); b.textContent = text;
      b.addEventListener("click", (e) => {
        e.stopPropagation(); cs[field] = val; save();
        chips.querySelectorAll("button").forEach((z) => z.classList.remove("on")); b.classList.add("on");
      });
      chips.appendChild(b);
    });
    wrap.appendChild(chips); return wrap;
  }

  // ── About + generic info ──────────────────────────────────
  function renderAbout() {
    menu.appendChild(header(t("about"), true));

    const doc = document.createElement("div");
    doc.className = "gwp-as-doc";

    const hero = document.createElement("div");
    hero.className = "gwp-as-hero";
    hero.innerHTML = `<div class="gwp-as-hero-orb"></div><div style="font-weight:700; font-size:35px; font-family:'Orbitron', sans-serif; letter-spacing:0.5px; line-height:1.1;">Gemini Wallpaper</div>`;
    doc.appendChild(hero);

    const intro = document.createElement("div");
    intro.className = "gwp-as-about-intro";
    ["ab_p1", "ab_p2", "ab_p3"].forEach((k) => {
      const p = document.createElement("p"); p.textContent = t(k); intro.appendChild(p);
    });
    doc.appendChild(intro);

    const gh = document.createElement("a");
    gh.className = "gwp-as-gh";
    gh.href = GITHUB; gh.target = "_blank"; gh.rel = "noopener noreferrer";
    gh.innerHTML = `<span>★</span><span></span>`;
    gh.lastChild.textContent = t("ab_github");
    doc.appendChild(gh);

    const sec = document.createElement("div");
    sec.className = "gwp-as-seclbl"; sec.textContent = t("ab_features");
    doc.appendChild(sec);

    // Feature list reuses the grid items' labels + intros (skip About itself).
    ITEMS.filter((it) => it.kind !== "about").forEach((it) => {
      const row = document.createElement("div");
      row.className = "gwp-as-feat";
      const ic = document.createElement("div");
      ic.className = "fic";
      ic.innerHTML = iconHtml(it);
      const tx = document.createElement("div");
      tx.className = "ftx";
      const b = document.createElement("b"); b.textContent = itLabel(it);
      const s = document.createElement("span"); s.textContent = itIntro(it);
      tx.appendChild(b); tx.appendChild(s);
      row.appendChild(ic); row.appendChild(tx);
      doc.appendChild(row);
    });

    const share = document.createElement("div");
    share.className = "gwp-as-share";
    share.textContent = t("ab_share");
    doc.appendChild(share);

    const copy = document.createElement("button");
    copy.className = "gwp-as-copy";
    copy.textContent = t("ab_copy");
    copy.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(GITHUB).then(
        () => { copy.textContent = t("ab_copied"); setTimeout(() => (copy.textContent = t("ab_copy")), 1600); },
        () => { copy.textContent = GITHUB; }
      );
    });
    doc.appendChild(copy);

    menu.appendChild(doc);
  }
  function renderInfo() {
    const it = infoItem;
    menu.appendChild(header(it ? itLabel(it) : "", true));
    const hero = document.createElement("div");
    hero.className = "gwp-as-hero";
    hero.innerHTML = `<div class="big">${it ? iconHtml(it) : ""}</div>`;
    menu.appendChild(hero);

    const note = document.createElement("div");
    note.className = "gwp-as-note"; note.textContent = it ? itIntro(it) : "";
    menu.appendChild(note);

    // The Code Theme card sets the default code-block look right here.
    if (it && it.id === "code") renderCodeControls();
  }

  // ── Storage sync ──────────────────────────────────────────
  function refreshHighlights() {
    if (menu && view === "home") {
      const items = menu.querySelectorAll(".gwp-as-item");
      ITEMS.forEach((it, i) => items[i]?.classList.toggle("on", ON_KEYS.includes(it.id) && !!state[it.id]));
    }
  }

  // Initial language follows the browser, falling back to English.
  const DEFAULT_LANG = (() => {
    const l = (navigator.language || "en").toLowerCase();
    if (l.startsWith("zh")) return "zh";
    const two = l.slice(0, 2);
    return LANGS.some(([v]) => v === two) ? two : "en";
  })();

  // Default code-block look — mirrors code-style.js DEFAULTS. The Settings panel
  // writes these to `codeStyle` (the default applied to un-customized blocks) and
  // `codeStyleEnabled`; code-style.js watches both keys and re-renders live.
  const CODE_DEFAULTS = { tintColor: "#0f1020", tintOpacity: 55, blur: 12, border: "solid", radius: 12, font: "", fontSize: 14, lineNumbers: false };

  const DEFAULTS = { lang: DEFAULT_LANG, petType: "duck", glassColor: "#000000", chatFont: "", cjkFont: "", imageData: "", imageQuality: "medium", chatboxScale: 100, codeStyle: CODE_DEFAULTS, codeStyleEnabled: true, [KEY_POS]: null, [KEY_ON]: false };
  ON_KEYS.forEach((k) => (DEFAULTS[k] = k === "enabled" || k === "thinkingBuddy" || k === "hideChatEnabled"));
  SLIDERS.forEach((sl) => (DEFAULTS[sl.key] = sl.toStore ? sl.toStore(sl.def) : sl.def));

  chrome.storage.local.get(DEFAULTS, (s) => {
    Object.keys(DEFAULTS).forEach((k) => { if (k !== KEY_POS) state[k] = s[k]; });
    if (s[KEY_POS]) { x = s[KEY_POS].x; y = s[KEY_POS].y; }
    else { x = window.innerWidth - SIZE - EDGE; y = Math.round(window.innerHeight * 0.5); }
    if (s[KEY_ON]) createBall();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const k in changes) if (k in state) state[k] = changes[k].newValue;
    if (KEY_ON in changes) changes[KEY_ON].newValue ? createBall() : removeBall();
    refreshHighlights();
  });

  window.addEventListener("resize", () => { if (ball) { place(); if (menuOpen) positionMenu(); } });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (document.getElementById("gwp-as-menu") || document.getElementById("gwp-as-backdrop"))) closeMenu();
  });

})();
