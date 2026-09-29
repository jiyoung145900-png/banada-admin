/**
 * ★★★ BANADA 프로필 카드 생성기 ★★★
 * 원본 banada_profile 디자인 완벽 재현 + 업그레이드
 *
 * [기능]
 * - 3가지 템플릿: Noir(다크) / Ivory(크림) / Stripe(바나나 밴드)
 * - 카드 언어 3개: 한국어 / 日本語 / English (프리셋 + UI 모두)
 * - BANADA 기본 로고 내장 (업로드 없이 바로 사용)
 * - 마지막 설정 자동 기억 (브랜드명/템플릿/언어/로고 설정)
 * - PNG 고해상도(3x) 다운로드
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { BANADA_LOGO } from "./banadaLogo";

// ═══════════════ UI 라벨 (3개 언어) ═══════════════
const L = {
  ko: {
    cardLang: "카드 언어", photo: "사진", facePos: "얼굴 위치",
    logo: "로고 (카드 좌상단)", useDefaultLogo: "BANADA 기본 로고",
    basic: "기본 정보", name: "이름", age: "나이", job: "직업",
    physical: "피지컬", height: "키 cm", size: "사이즈", weight: "몸무게 kg",
    intro: "소개", charm: "매력 포인트 (한 줄)", bio: "한 줄 소개",
    hobbies: "관심사 (쉼표로 구분)", brand: "업체명", style: "카드 스타일",
    random: "🎲 랜덤", save: "📥 PNG로 저장", saving: "저장 중...",
    addPhoto: "사진 추가", defaultName: "이름", profile: "PROFILE",
    title: "프로필 카드 생성기", close: "닫기",
    translate: "🌐 번역", translating: "번역 중...",
    transFrom: "한국어 내용을 현재 언어로 번역",
    transNeedKo: "먼저 한국어로 내용을 입력하세요.",
    transDone: "번역 완료!",
    transFail: "번역 실패",
    transSameLang: "이미 한국어입니다. 🇯🇵 또는 🇬🇧 탭을 선택하세요.",
  },
  ja: {
    cardLang: "カード言語", photo: "写真", facePos: "顔の位置",
    logo: "ロゴ (カード左上)", useDefaultLogo: "BANADA デフォルトロゴ",
    basic: "基本情報", name: "名前", age: "年齢", job: "職業",
    physical: "スタイル", height: "身長 cm", size: "サイズ", weight: "体重 kg",
    intro: "紹介", charm: "魅力ポイント (一行)", bio: "一言紹介",
    hobbies: "興味 (カンマ区切り)", brand: "店名", style: "カードスタイル",
    random: "🎲 ランダム", save: "📥 PNGで保存", saving: "保存中...",
    addPhoto: "写真を追加", defaultName: "名前", profile: "プロフィール",
    title: "プロフィールカード作成", close: "閉じる",
    translate: "🌐 韓国語から翻訳", translating: "翻訳中...",
    transFrom: "韓国語の内容を日本語に翻訳",
    transNeedKo: "先に韓国語タブで内容を入力してください。",
    transDone: "翻訳完了！",
    transFail: "翻訳失敗",
    transSameLang: "すでに韓国語です。",
  },
  en: {
    cardLang: "Card Language", photo: "Photo", facePos: "Face position",
    logo: "Logo (top-left)", useDefaultLogo: "BANADA default logo",
    basic: "Basic Info", name: "Name", age: "Age", job: "Job",
    physical: "Physical", height: "Height cm", size: "Size", weight: "Weight kg",
    intro: "Intro", charm: "Charm point (one line)", bio: "Short bio",
    hobbies: "Interests (comma separated)", brand: "Brand", style: "Card Style",
    random: "🎲 Random", save: "📥 Save as PNG", saving: "Saving...",
    addPhoto: "Add photo", defaultName: "Name", profile: "PROFILE",
    title: "Profile Card Studio", close: "Close",
    translate: "🌐 Translate from Korean", translating: "Translating...",
    transFrom: "Translate Korean content to English",
    transNeedKo: "Enter the content in the Korean tab first.",
    transDone: "Translation complete!",
    transFail: "Translation failed",
    transSameLang: "Already Korean.",
  },
};

// ═══════════════ 프리셋 - 한국어 ═══════════════
const CHARM_KO = [
  "밝은 미소, 섬세한 마음","청순한 매력, 도도한 눈빛","부드러운 목소리, 사랑스러운 웃음",
  "긴 생머리, 우아한 몸매","순수한 눈빛, 요염한 분위기","깨끗한 피부, 슬림한 라인",
  "귀여운 얼굴, 반전 볼륨감","청초한 이미지, 지적인 매력","달콤한 목소리, 애교 넘치는 말투",
  "고양이상 눈매, 시크한 매력","강아지상, 사랑스러운 미소","동안 외모, 성숙한 분위기",
  "슬림한 몸매, 볼륨감 있는 라인","화려한 이목구비, 매혹적인 눈빛","청순 글래머, 반전 매력",
  "다정한 성격, 세련된 스타일","지적인 매력, 유쾌한 성격","차분한 목소리, 우아한 몸짓",
  "밝은 에너지, 긍정적인 마인드","센스 있는 대화, 배려 깊은 마음","청순한 얼굴, 볼륨감 있는 몸매",
  "여리여리한 몸매, 강한 인상","고급스러운 분위기, 우아한 매너","상큼한 미소, 발랄한 성격",
  "몽환적인 눈빛, 신비로운 분위기","섬세한 손길, 따뜻한 마음","명품 라인, 시선 강탈",
  "화이트 피부, 인형 같은 비주얼","오똑한 콧날, 도톰한 입술","긴 다리, 잘록한 허리",
  "부드러운 곡선, 완벽한 비율","청량한 미소, 시원한 인상","깊은 눈빛, 매혹적인 아우라",
  "청순 도발, 반전 섹시","귀엽고 사랑스러운, 애교 만점","차분하고 세련된, 지적인 여성",
  "발랄하고 유쾌한, 밝은 에너지","우아하고 고급스러운, 여신 비주얼","청순하고 순수한, 첫사랑 느낌",
  "성숙하고 매혹적인, 어른의 매력","동안 미모, 볼륨 라인","청순한 미소, 관능적인 몸매",
  "지적이고 세련된, 매너 있는 성격","다정하고 배려 깊은, 따뜻한 여성","밝고 긍정적인, 활기찬 매력",
  "차분하고 우아한, 클래식한 아름다움","청량하고 시원한, 상쾌한 매력","몽환적이고 신비한, 예술가 감성",
  "섬세하고 감성적인, 로맨틱한 여성","고급스럽고 세련된, 럭셔리한 분위기","청순하고 사랑스러운, 첫인상 만점",
  "지적이고 유머러스한, 대화가 즐거운","부드럽고 다정한, 편안한 매력","화려하고 매혹적인, 시선 집중",
  "청초하고 순수한, 맑은 눈빛","성숙하고 우아한, 여성스러운 매력","발랄하고 상큼한, 청춘의 매력",
  "차분하고 지적인, 신뢰감 있는 여성","매혹적이고 도도한, 팜므파탈","따뜻하고 포근한, 힐링되는 매력",
];
const BIO_KO = [
  "아름다운 순간들을 소중히 여기며, 진정한 인연을 기다립니다.",
  "함께하는 시간이 특별해지는 만남을 원해요.",
  "서로에게 좋은 추억이 되는 만남을 만들어가고 싶어요.",
  "진심으로 대화하고 편안하게 즐길 수 있는 분을 찾아요.",
  "매너 있고 다정하신 분과 좋은 시간 보내고 싶습니다.",
  "특별한 하루를 함께 만들어갈 인연을 기다리고 있어요.",
  "부담 없이 편안한 만남을 선호합니다.",
  "즐거운 대화와 진솔한 마음이 있는 만남을 원해요.",
  "품격 있는 분위기 속에서 함께 즐길 수 있길 바라요.",
  "센스 있는 분과의 대화가 가장 큰 즐거움입니다.",
  "오늘 하루가 특별해질 인연을 기다리고 있어요.",
  "매너 좋으신 분과 부담 없이 만나고 싶어요.",
  "서로 예의를 지키며 즐거운 시간을 보내요.",
  "진심으로 저를 봐주시는 분을 만나고 싶습니다.",
  "짧은 만남도 소중하게 기억되길 바라요.",
  "밝고 유쾌한 분위기로 시간을 채우고 싶어요.",
  "특별한 대화, 특별한 감정을 나누고 싶어요.",
  "잠깐이라도 진심으로 통하는 만남을 원합니다.",
  "센스와 매너를 갖춘 분과의 만남을 선호해요.",
  "편안한 분위기에서 서로를 알아가고 싶어요.",
  "즐거운 시간, 좋은 기억으로 남는 만남을 원해요.",
  "서로에게 힐링이 되는 만남을 꿈꿔요.",
  "품위 있고 여유로운 만남을 선호합니다.",
  "함께 있으면 시간이 빨리 가는 그런 분을 찾아요.",
  "가벼운 웃음과 진심 어린 대화를 나눌 수 있길.",
  "부담 없이 서로를 존중하며 즐거운 만남 원해요.",
  "매너와 센스를 갖추신 분이면 더 좋겠어요.",
  "특별한 밤을 함께 만들어갈 분을 기다립니다.",
  "진심 어린 대화가 오가는 만남을 좋아해요.",
  "서로에게 편안함을 주는 관계를 원해요.",
  "예의 바르고 다정하신 분 환영합니다.",
  "잊지 못할 순간을 함께 만들어봐요.",
  "달콤한 대화와 로맨틱한 분위기를 좋아해요.",
  "서로에게 좋은 기억으로 남기를 바라요.",
  "여유롭고 품격 있는 만남을 지향해요.",
  "따뜻한 마음을 나눌 수 있는 분을 찾습니다.",
  "센스 넘치는 대화와 편안한 시간을 즐겨요.",
  "은은한 분위기 속에서 서로를 알아가고 싶어요.",
  "진지하지도, 가볍지도 않은 딱 좋은 만남을.",
  "저를 아껴주실 분과의 시간을 소중히 여겨요.",
  "즐거움과 설렘이 있는 만남을 원합니다.",
  "특별한 하루의 주인공이 되고 싶으신 분 환영.",
  "서로 매너를 지키며 즐거운 시간 보내요.",
  "달콤하고 부드러운 분위기를 좋아해요.",
  "품격 있는 신사분과의 만남을 선호합니다.",
  "진심으로 대해주시는 만큼 저도 최선을 다해요.",
  "편안하고 자연스러운 만남이 가장 좋아요.",
  "따뜻하게 맞아주실 분을 기다립니다.",
  "매너 지키시는 분이라면 언제든 환영이에요.",
  "함께 있는 시간이 즐거운 만남을 원해요.",
  "은근한 매력에 빠져드는 만남을 만들어봐요.",
  "저와 좋은 케미가 통하는 분을 만나고 싶어요.",
  "짧은 시간도 알차게 채워가는 만남을 선호해요.",
  "설렘 가득한 첫 만남을 기대하고 있어요.",
  "부드럽고 다정한 분위기를 사랑해요.",
  "저를 여왕처럼 대해주실 분과 함께하고 싶어요.",
  "특별한 감정이 오가는 만남을 원합니다.",
  "센스 있는 리드가 있는 분을 좋아해요.",
  "진솔하고 따뜻한 시간을 함께 나눠요.",
  "오늘 밤, 특별한 인연이 되어주세요.",
];
const HOBBY_KO = [
  "아트 갤러리, 요가, 와인, 클래식","카페 투어, 산책, 재즈, 독서","브런치, 필라테스, 샴페인, 여행",
  "전시회, 러닝, 칵테일, 영화","미술관, 요가, 홈 파티, 사진","쇼핑, 스파, 디저트, 뮤지컬",
  "북 카페, 명상, 티 타임, 향수","패션, 헬스, 파인 다이닝, 음악","메이크업, 필라테스, 브런치, 넷플릭스",
  "인테리어, 요리, 와인 바, 콘서트","드라이브, 카페, 캔들, 재즈 바","발레, 클래식, 티 소믈리에, 향초",
  "골프, 리조트, 스파, 오마카세","테니스, 브런치, 샴페인, 별장","요트, 다이빙, 리조트, 파티",
  "승마, 와이너리, 미슐랭, 여행","필라테스, 마사지, 뷰티, 쇼핑","요가, 명상, 오가닉, 힐링",
  "사진, 여행, 카페, 소품","그림, 전시, 아트북, 재즈","글쓰기, 시, 문학, 클래식",
  "영화, 드라마, 팝콘, 홈시어터","게임, 만화, 애니, 굿즈","홈 카페, 베이킹, 원두, 라떼아트",
  "쿠킹, 파스타, 와인, 티라미수","칵테일, 위스키, 재즈 바, 야경","루프탑, 스카이라운지, 샴페인, 도시",
  "호캉스, 스파, 룸서비스, 뷰","여행, 리조트, 비치, 선셋","겨울 스포츠, 스키, 온천, 코트",
  "축제, 파티, 클럽, 드레스업","패션위크, 명품, 편집숍, 트렌드","뷰티, 스킨케어, 향수, 셀프케어",
  "K팝, 콘서트, 팬미팅, 굿즈","발레, 오페라, 클래식, 앤티크","미술관, 조각, 현대미술, 큐레이션",
  "재즈, LP, 바이닐, 오디오","브런치, 아메리카노, 크루아상, 신문","산책, 반려동물, 공원, 힐링",
  "홈트, 필라테스, 프로틴, 다이어트","명상, 요가, 아쉬탕가, 사트비카","타로, 사주, 별자리, 점성술",
  "위스키, 시가, 재즈, 바","샴페인, 마카롱, 애프터눈 티, 우아","와인, 치즈, 살라미, 유러피안",
  "카페, 라떼, 크루아상, 유럽 감성","브런치, 에그 베네딕트, 미모사, 주말","쇼핑, 청담, 편집숍, 브랜드",
  "핫플, SNS, 인스타, 감성","여행, 도쿄, 파리, 뉴욕","제주, 발리, 몰디브, 파타야",
  "댄스, 클럽, EDM, 리듬","카페 투어, 로스터리, 원두, 드립","북클럽, 소설, 에세이, 문학상",
  "홈 무비, 넷플릭스, 왓챠, 팝콘","베이킹, 스콘, 마들렌, 홈 카페","플라워, 꽃꽂이, 프리저브드, 감성",
  "캔들, 디퓨저, 향수, 무드","홈 파티, 소셜, 와인, 대화","럭셔리, 파인 다이닝, 오마카세, 미슐랭",
];

// ═══════════════ 프리셋 - 일본어 ═══════════════
const CHARM_JA = [
  "明るい笑顔、繊細な心","清楚な魅力、凛とした眼差し","優しい声、愛らしい笑い",
  "長いストレートヘア、優雅なスタイル","純粋な瞳、艶やかな雰囲気","透明感のある肌、スリムなライン",
  "可愛い顔立ち、ギャップのあるボリューム感","清らかなイメージ、知的な魅力","甘い声、甘えん坊な話し方",
  "猫目、シックな魅力","犬顔、愛らしい笑顔","童顔、大人びた雰囲気",
  "スリムな体型、メリハリのあるライン","華やかな顔立ち、魅惑的な眼差し","清楚グラマー、ギャップ萌え",
  "優しい性格、洗練されたスタイル","知的な魅力、愉快な性格","落ち着いた声、優雅な仕草",
  "明るいエネルギー、ポジティブな考え方","センスある会話、思いやりのある心","高級感のあるライン、視線を奪う",
  "白い肌、人形のようなビジュアル","すっと通った鼻筋、ふっくらした唇","長い脚、くびれたウエスト",
  "深い眼差し、魅惑的なオーラ","清楚な挑発、ギャップセクシー","優雅で高級感のある、女神ビジュアル",
  "温かい心を分かち合える魅力","幻想的な瞳、神秘的な雰囲気","繊細な手つき、温かい心",
  "柔らかな曲線、完璧なプロポーション","爽やかな笑顔、涼やかな印象","上品な雰囲気、優雅なマナー",
  "さっぱりした笑顔、活発な性格","華やかで魅惑的、視線集中","清らかで純粋、澄んだ眼差し",
  "成熟して優雅、女性らしい魅力","元気で爽やか、青春の魅力","落ち着いて知的、信頼感のある女性",
  "魅惑的で凛とした、ファムファタール","温かくて包容力のある、癒される魅力","知的でユーモアのある、会話が楽しい",
];
const BIO_JA = [
  "美しい瞬間を大切にしながら、真の縁を待っています。",
  "共に過ごす時間が特別になる出会いを望んでいます。",
  "お互いに良い思い出になる出会いを作っていきたいです。",
  "心から会話し、気楽に楽しめる方を探しています。",
  "マナーがあり優しい方と良い時間を過ごしたいです。",
  "特別な一日を一緒に作っていく縁を待っています。",
  "気負わずリラックスした出会いを好みます。",
  "楽しい会話と真摯な心のある出会いを望みます。",
  "品格ある雰囲気の中で一緒に楽しめることを願います。",
  "センスある方との会話が最大の楽しみです。",
  "今日という日が特別になる縁を待っています。",
  "お互いに礼儀を守り、楽しい時間を過ごしましょう。",
  "短い時間でも心から通じ合う出会いを望みます。",
  "リラックスした雰囲気でお互いを知っていきたいです。",
  "お互いに癒しになる出会いを夢見ています。",
  "気品があり、ゆとりのある出会いを好みます。",
  "一緒にいると時間が早く過ぎるような方を探しています。",
  "軽やかな笑いと心からの会話を交わせますように。",
  "マナーとセンスを備えた方であればより嬉しいです。",
  "特別な夜を一緒に作っていく方を待っています。",
  "お互いに心地よさを与える関係を望みます。",
  "礼儀正しく優しい方を歓迎します。",
  "忘れられない瞬間を一緒に作りましょう。",
  "甘い会話とロマンチックな雰囲気が好きです。",
  "ゆとりがあり品格のある出会いを目指します。",
  "温かい心を分かち合える方を探しています。",
  "ほのかな雰囲気の中でお互いを知っていきたいです。",
  "真剣すぎず、軽すぎない、ちょうど良い出会いを。",
  "楽しさとときめきのある出会いを望みます。",
  "特別な一日の主人公になりたい方を歓迎します。",
  "甘くて優しい雰囲気が好きです。",
  "品格ある紳士の方との出会いを好みます。",
  "誠実に接していただく分、私も最善を尽くします。",
  "自然でリラックスした出会いが一番好きです。",
  "マナーを守る方ならいつでも歓迎です。",
  "一緒にいる時間が楽しい出会いを望みます。",
  "短い時間も充実させる出会いを好みます。",
  "ときめきに満ちた初めての出会いを期待しています。",
  "柔らかく優しい雰囲気を愛しています。",
  "特別な感情が行き交う出会いを望みます。",
  "センスあるリードのある方が好きです。",
  "率直で温かい時間を一緒に分かち合いましょう。",
  "今夜、特別な縁になってください。",
];
const HOBBY_JA = [
  "アートギャラリー、ヨガ、ワイン、クラシック","カフェ巡り、散歩、ジャズ、読書","ブランチ、ピラティス、シャンパン、旅行",
  "展示会、ランニング、カクテル、映画","美術館、ヨガ、ホームパーティー、写真","ショッピング、スパ、デザート、ミュージカル",
  "ブックカフェ、瞑想、ティータイム、香水","ファッション、ジム、ファインダイニング、音楽","メイク、ピラティス、ブランチ、Netflix",
  "インテリア、料理、ワインバー、コンサート","ドライブ、カフェ、キャンドル、ジャズバー","バレエ、クラシック、紅茶、アロマ",
  "ゴルフ、リゾート、スパ、おまかせ","テニス、ブランチ、シャンパン、別荘","ヨット、ダイビング、リゾート、パーティー",
  "乗馬、ワイナリー、ミシュラン、旅行","ピラティス、マッサージ、ビューティー、ショッピング","ヨガ、瞑想、オーガニック、ヒーリング",
  "写真、旅行、カフェ、小物","絵画、展示、アートブック、ジャズ","執筆、詩、文学、クラシック",
  "映画、ドラマ、ポップコーン、ホームシアター","ホームカフェ、ベーキング、豆、ラテアート","料理、パスタ、ワイン、ティラミス",
  "カクテル、ウイスキー、ジャズバー、夜景","ルーフトップ、スカイラウンジ、シャンパン、都市","ホテルステイ、スパ、ルームサービス、絶景",
  "旅行、リゾート、ビーチ、サンセット","ウィンタースポーツ、スキー、温泉、コート","フェス、パーティー、クラブ、ドレスアップ",
  "ファッションウィーク、ブランド、セレクトショップ、トレンド","ビューティー、スキンケア、香水、セルフケア","K-POP、コンサート、ファンミーティング、グッズ",
  "バレエ、オペラ、クラシック、アンティーク","美術館、彫刻、現代美術、キュレーション","ジャズ、LP、レコード、オーディオ",
  "散歩、ペット、公園、ヒーリング","宅トレ、ピラティス、プロテイン、ダイエット","タロット、占い、星座、占星術",
  "ウイスキー、シガー、ジャズ、バー","シャンパン、マカロン、アフタヌーンティー、優雅","ワイン、チーズ、サラミ、ヨーロピアン",
  "旅行、東京、パリ、ニューヨーク","済州、バリ、モルディブ、パタヤ","ダンス、クラブ、EDM、リズム",
];

// ═══════════════ 프리셋 - 영어 ═══════════════
const CHARM_EN = [
  "Bright smile, delicate heart","Pure charm, confident gaze","Soft voice, lovely laugh",
  "Long straight hair, elegant figure","Innocent eyes, alluring atmosphere","Clear skin, slim lines",
  "Cute face, surprising curves","Graceful image, intellectual charm","Sweet voice, affectionate tone",
  "Cat-like eyes, chic charm","Puppy-like, lovely smile","Youthful looks, mature presence",
  "Slim figure, curvy lines","Striking features, captivating gaze","Elegant glamour, delightful contrast",
  "Warm personality, refined style","Intellectual charm, cheerful nature","Calm voice, graceful movements",
  "Bright energy, positive mindset","Thoughtful conversation, caring heart","Luxurious lines, eye-catching",
  "Fair skin, doll-like visuals","Defined nose, full lips","Long legs, slender waist",
  "Deep gaze, magnetic aura","Innocent yet bold, surprising allure","Elegant and refined, goddess visuals",
  "Charm that shares warmth","Dreamy eyes, mysterious air","Gentle touch, warm heart",
  "Soft curves, perfect proportions","Refreshing smile, cool impression","Upscale atmosphere, graceful manners",
  "Crisp smile, lively personality","Glamorous and captivating, all eyes on her","Pure and clear, bright gaze",
  "Mature and elegant, feminine charm","Lively and fresh, youthful appeal","Composed and intellectual, trustworthy",
  "Alluring and confident, femme fatale","Warm and comforting, healing presence","Intellectual and witty, great conversation",
];
const BIO_EN = [
  "Cherishing beautiful moments while waiting for a true connection.",
  "Looking for a meeting where our time together becomes special.",
  "I want to create a meeting that becomes a good memory for both of us.",
  "Looking for someone I can talk to sincerely and enjoy comfortably.",
  "I would love to spend good time with someone mannered and kind.",
  "Waiting for a connection to create a special day together.",
  "I prefer a relaxed meeting without pressure.",
  "I want a meeting with pleasant conversation and sincere feelings.",
  "Hoping we can enjoy ourselves in an atmosphere of class.",
  "Conversation with someone tasteful is my greatest joy.",
  "Waiting for the connection that will make today special.",
  "Let's respect each other and have a wonderful time.",
  "Even a brief meeting can be truly meaningful.",
  "I want to get to know each other in a relaxed atmosphere.",
  "Dreaming of a meeting that heals us both.",
  "I prefer a dignified and unhurried encounter.",
  "Looking for someone whose company makes time fly.",
  "Hoping to share easy laughter and heartfelt conversation.",
  "It would be even better if you have manners and taste.",
  "Waiting for someone to create a special evening with.",
  "I want a relationship where we bring each other ease.",
  "Polite and kind gentlemen are always welcome.",
  "Let's create an unforgettable moment together.",
  "I love sweet conversation and a romantic atmosphere.",
  "I aim for relaxed encounters with a sense of class.",
  "Looking for someone I can share warmth with.",
  "I want to get to know you in a subtle, gentle mood.",
  "Not too serious, not too casual — just right.",
  "I want a meeting full of joy and anticipation.",
  "Welcome if you want to be the star of a special day.",
  "I love a sweet and gentle atmosphere.",
  "I prefer meeting a gentleman with class.",
  "I give my best to those who treat me sincerely.",
  "A natural and comfortable meeting is what I like most.",
  "Always welcome if you keep good manners.",
  "I want time together that's genuinely enjoyable.",
  "I prefer making even short time truly worthwhile.",
  "Looking forward to a first meeting full of excitement.",
  "I love a soft and affectionate atmosphere.",
  "I want a meeting where special feelings are exchanged.",
  "I like someone who leads with good taste.",
  "Let's share honest and warm moments together.",
  "Tonight, become a special connection.",
];
const HOBBY_EN = [
  "Art galleries, yoga, wine, classical","Cafe hopping, walks, jazz, reading","Brunch, pilates, champagne, travel",
  "Exhibitions, running, cocktails, film","Museums, yoga, home parties, photography","Shopping, spa, desserts, musicals",
  "Book cafes, meditation, tea time, perfume","Fashion, fitness, fine dining, music","Makeup, pilates, brunch, Netflix",
  "Interiors, cooking, wine bars, concerts","Drives, cafes, candles, jazz bars","Ballet, classical, tea, aromatherapy",
  "Golf, resorts, spa, omakase","Tennis, brunch, champagne, villas","Yachting, diving, resorts, parties",
  "Horseback riding, wineries, Michelin, travel","Pilates, massage, beauty, shopping","Yoga, meditation, organic, healing",
  "Photography, travel, cafes, decor","Painting, exhibits, art books, jazz","Writing, poetry, literature, classical",
  "Film, drama, popcorn, home theater","Home cafe, baking, coffee beans, latte art","Cooking, pasta, wine, tiramisu",
  "Cocktails, whisky, jazz bars, night views","Rooftops, sky lounges, champagne, cityscapes","Hotel stays, spa, room service, views",
  "Travel, resorts, beaches, sunsets","Winter sports, skiing, hot springs, coats","Festivals, parties, clubs, dressing up",
  "Fashion week, luxury, boutiques, trends","Beauty, skincare, perfume, self-care","K-pop, concerts, fan meetings, merch",
  "Ballet, opera, classical, antiques","Museums, sculpture, modern art, curation","Jazz, LPs, vinyl, audio",
  "Walks, pets, parks, healing","Home workouts, pilates, protein, wellness","Tarot, astrology, star signs, readings",
  "Whisky, cigars, jazz, bars","Champagne, macarons, afternoon tea, elegance","Wine, cheese, salami, European",
  "Travel, Tokyo, Paris, New York","Jeju, Bali, Maldives, Pattaya","Dance, clubs, EDM, rhythm",
];

const PRESETS = {
  ko: [CHARM_KO, BIO_KO, HOBBY_KO],
  ja: [CHARM_JA, BIO_JA, HOBBY_JA],
  en: [CHARM_EN, BIO_EN, HOBBY_EN],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const TEMPLATES = [
  { id: "noir", label: "Noir", hint: { ko: "풀블리드 · 다크", ja: "フルブリード · ダーク", en: "Full-bleed · Dark" } },
  { id: "ivory", label: "Ivory", hint: { ko: "매거진 · 크림", ja: "マガジン · クリーム", en: "Magazine · Cream" } },
  { id: "stripe", label: "Stripe", hint: { ko: "바나나 밴드", ja: "バナナバンド", en: "Banana band" } },
];

const LANGS = [
  { id: "ko", flag: "🇰🇷", label: "한국어" },
  { id: "ja", flag: "🇯🇵", label: "日本語" },
  { id: "en", flag: "🇬🇧", label: "English" },
];

const STORAGE_KEY = "banada_profile_card_settings";

// ★ 언어별로 따로 보관하는 텍스트 필드 (번역 대상)
const EMPTY_TEXTS = { name: "", job: "", charm: "", bio: "", hobbies: "", cupSize: "" };
const TEXT_KEYS = ["name", "job", "charm", "bio", "hobbies", "cupSize"];

// ─────────── 이미지 리사이즈 유틸 ───────────
const readImage = (file, maxSize, format = "image/png", quality = 1) =>
  new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) return reject(new Error("이미지 파일만 가능합니다"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 처리할 수 없습니다"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL(format, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

// ─────────── 초승달 아이콘 ───────────
const Crescent = ({ size = 14, color = "#f0c400" }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path fill={color} d="M16.2 3.2a9 9 0 1 0 3.1 16.6 7.25 7.25 0 1 1-3.1-16.6z" />
  </svg>
);

// ═══════════════════════════════════════════════
export default function ProfileCardModal({ onClose }) {
  const cardRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);

  // ★ 언어별 텍스트 (번역 대상 필드)
  const [texts, setTexts] = useState({
    ko: { ...EMPTY_TEXTS }, ja: { ...EMPTY_TEXTS }, en: { ...EMPTY_TEXTS },
  });

  // ★ 마지막 설정 복원 (사진은 용량 때문에 저장 안 함)
  const [form, setForm] = useState(() => {
    const base = {
      age: "", height: "", weight: "",
      photo: null, photoPos: 28,
      logo: BANADA_LOGO, useDefaultLogo: true,
      brandName: "BANADA", template: "noir", lang: "ko",
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const useDefault = s.useDefaultLogo !== false;
        return {
          ...base,
          brandName: s.brandName || "BANADA",
          template: TEMPLATES.some(t => t.id === s.template) ? s.template : "noir",
          lang: L[s.lang] ? s.lang : "ko",
          useDefaultLogo: useDefault,
          logo: useDefault ? BANADA_LOGO : null,
        };
      }
    } catch { /* 무시 */ }
    return base;
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  // ★ UI 라벨은 항상 한국어 (관리자가 한국인이므로)
  const t = L.ko;
  // ★ 카드 안에 들어가는 텍스트만 언어별
  const cardT = L[form.lang] || L.ko;

  // ★ 현재 언어의 텍스트
  const cur = texts[form.lang] || texts.ko;
  const setText = (k, v) => setTexts(p => ({ ...p, [form.lang]: { ...p[form.lang], [k]: v } }));

  // ★ 설정 자동 저장
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        brandName: form.brandName,
        template: form.template,
        lang: form.lang,
        useDefaultLogo: form.useDefaultLogo,
      }));
    } catch { /* 무시 */ }
  }, [form.brandName, form.template, form.lang, form.useDefaultLogo]);

  // html2canvas 미리 로드
  useEffect(() => {
    if (window.html2canvas) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    document.head.appendChild(s);
  }, []);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { set("photo", await readImage(file, 1600, "image/jpeg", 0.9)); }
    catch (err) { alert(err.message); }
  };

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await readImage(file, 400);
      setForm(p => ({ ...p, logo: url, useDefaultLogo: false }));
    } catch (err) { alert(err.message); }
  };

  const toggleDefaultLogo = () => {
    setForm(p => {
      const next = !p.useDefaultLogo;
      return { ...p, useDefaultLogo: next, logo: next ? BANADA_LOGO : null };
    });
  };

  // ★ 언어별 랜덤 프리셋
  const handleRandom = () => {
    const [c, b, h] = PRESETS[form.lang] || PRESETS.ko;
    setTexts(p => ({
      ...p,
      [form.lang]: { ...p[form.lang], charm: pick(c), bio: pick(b), hobbies: pick(h) },
    }));
  };

  // ★★★ [신규] DeepL 자동번역 - 한국어 → 일본어 + 영어 한 번에
  const handleTranslate = async () => {
    const ko = texts.ko;
    const hasContent = TEXT_KEYS.some(k => ko[k]?.trim());
    if (!hasContent) return alert("먼저 🇰🇷 한국어 탭에서 내용을 입력하세요.");

    setTranslating(true);
    try {
      const { translate } = await import("./TranslationService");

      // 일본어 + 영어 동시 번역
      const jobs = [];
      TEXT_KEYS.forEach(k => {
        const val = ko[k]?.trim();
        jobs.push(val ? translate(val, "JA", "KO") : Promise.resolve(""));
        jobs.push(val ? translate(val, "EN-US", "KO") : Promise.resolve(""));
      });
      const res = await Promise.all(jobs);

      const outJa = {}, outEn = {};
      TEXT_KEYS.forEach((k, i) => {
        outJa[k] = res[i * 2] || ko[k] || "";
        outEn[k] = res[i * 2 + 1] || ko[k] || "";
      });

      setTexts(p => ({ ...p, ja: outJa, en: outEn }));
      alert("✅ 일본어 · 영어 번역 완료!\n탭을 눌러 확인하세요.");
    } catch (err) {
      alert("❌ 번역 실패: " + (err?.message || err) + "\n\n(배포된 사이트에서만 작동합니다)");
    } finally {
      setTranslating(false);
    }
  };

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    if (!window.html2canvas) return alert("잠시 후 다시 시도해주세요.");
    setSaving(true);
    try {
      const canvas = await window.html2canvas(cardRef.current, {
        scale: 3, useCORS: true,
        backgroundColor: form.template === "ivory" ? "#f4efe3" : "#12110e",
      });
      const safe = (s, fb) => (s || fb).replace(/[^\w가-힣ぁ-んァ-ヶ一-龯]+/g, "_").replace(/^_|_$/g, "") || fb;
      const link = document.createElement("a");
      link.download = `${safe(form.brandName, "BANADA")}_${safe(texts.ko.name || cur.name, "profile")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      alert("저장 실패: " + err.message);
    } finally {
      setSaving(false);
    }
  }, [form, texts, cur]);

  // ─────────── 파생 데이터 ───────────
  const title = [cur.name, form.age].filter(Boolean).join(", ");
  const brand = (form.brandName || "BANADA").toUpperCase();
  const stats = [
    form.height ? `${form.height}cm` : null,
    cur.cupSize || null,
    form.weight ? `${form.weight}kg` : null,
    cur.job || null,
  ].filter(Boolean);
  const hobbies = (cur.hobbies || "").split(/[,，、]/).map(h => h.trim()).filter(Boolean).slice(0, 8);

  const T = form.template;
  const isNoir = T === "noir";
  const isIvory = T === "ivory";
  const isStripe = T === "stripe";

  // ─────────── 카드 스타일 (원본 CSS 재현) ───────────
  const C = {
    card: {
      width: 380, maxWidth: "100%", overflow: "hidden", position: "relative",
      fontFamily: "'Noto Sans KR', ui-sans-serif, sans-serif", borderRadius: 16,
      background: isIvory ? "#f4efe3" : "#12110e",
      color: isIvory ? "#12110e" : "#f4efe3",
      boxShadow: "0 28px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(240,196,0,0.16)",
    },
    photo: {
      position: "relative", overflow: "hidden",
      background: isIvory ? "#ebe4d4" : "#1a1914",
      height: isNoir ? 348 : isIvory ? 292 : 300,
      ...(isIvory ? { margin: "14px 14px 0", borderRadius: 12 } : {}),
    },
    photoImg: {
      width: "100%", height: "100%", objectFit: "cover", display: "block",
      objectPosition: `50% ${form.photoPos}%`,
    },
    veil: isNoir ? {
      position: "absolute", bottom: 0, left: 0, right: 0, height: 160,
      background: "linear-gradient(to top, #12110e 0%, rgba(18,17,14,0) 100%)",
    } : { display: "none" },
    brandTag: {
      position: "absolute", top: 16, left: 16, zIndex: 2,
      display: "flex", alignItems: "center", gap: 8, color: "#f0c400",
      fontFamily: "Syne, 'Noto Sans KR', sans-serif",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.28em",
      textShadow: "0 1px 8px rgba(18,17,14,0.55)",
    },
    brandLogo: { height: 18, width: "auto", maxWidth: 48, objectFit: "contain", borderRadius: 2 },
    body: {
      padding: "22px 22px 24px",
      ...(isNoir ? { marginTop: -72, position: "relative", zIndex: 2, paddingTop: 8 } : {}),
    },
    name: {
      margin: 0, fontFamily: "Syne, 'Noto Sans KR', sans-serif",
      fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15,
      color: isNoir ? "#f0c400" : isIvory ? "#12110e" : "#f4efe3",
    },
    stats: {
      margin: "10px 0 0", fontSize: 12, letterSpacing: "0.04em", lineHeight: 1.5,
      color: isIvory ? "#6f6858" : "#a39b88",
    },
    charm: {
      margin: "14px 0 0", fontSize: 13, fontWeight: 500, lineHeight: 1.5,
      color: isStripe ? "#f0c400" : isIvory ? "#3a372f" : "#f4efe3",
    },
    bio: {
      margin: "16px 0 0", padding: "14px 16px", fontSize: 13, fontStyle: "italic", lineHeight: 1.65,
      background: isIvory ? "#ebe4d4" : "#1a1914",
      color: isIvory ? "#3a372f" : "#cfc6b2",
      borderLeft: "3px solid #f0c400",
    },
    tag: {
      padding: "6px 11px", borderRadius: 999, fontSize: 11, fontWeight: 500,
      letterSpacing: "0.02em", display: "inline-block",
      background: isStripe ? "#f0c400" : isIvory ? "#12110e" : "#24231d",
      color: isStripe ? "#12110e" : isIvory ? "#f0c400" : "#f4efe3",
    },
    stripeHead: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 18px", background: "#f0c400", color: "#12110e",
      fontFamily: "Syne, 'Noto Sans KR', sans-serif",
      fontSize: 11, fontWeight: 700, letterSpacing: "0.28em",
    },
    stripeLogo: { height: 16, width: "auto", maxWidth: 40, objectFit: "contain", borderRadius: 2 },
    emptyPhoto: {
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 12, position: "relative",
      background: isIvory
        ? "radial-gradient(ellipse 80% 58% at 50% 38%, #efe6d2 0%, #d9d0bc 72%)"
        : "radial-gradient(ellipse 80% 58% at 50% 38%, #2c281f 0%, #12110e 72%)",
      color: isIvory ? "#12110e" : "#f0c400",
      letterSpacing: "0.28em", fontSize: 10, fontWeight: 700,
    },
    watermark: {
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 56, letterSpacing: "0.14em", fontWeight: 800,
      color: isIvory ? "rgba(18,17,14,0.08)" : "rgba(240,196,0,0.09)",
      pointerEvents: "none",
    },
  };

  const tabBtn = (active) => ({
    flex: 1, padding: "7px 4px", borderRadius: 8, border: "none", cursor: "pointer",
    background: active ? "#f0c400" : "#222",
    color: active ? "#000" : "#888",
    fontWeight: 800, fontSize: 11,
  });

  return (
    <div style={ov.overlay}>
      <div style={ov.container}>
        <div style={ov.header}>
          <h2 style={{ color: "#f0c400", margin: 0, fontSize: 18 }}>🃏 {t.title}</h2>
          <button onClick={onClose} style={ov.closeBtn}>{t.close}</button>
        </div>

        <div style={ov.content}>
          {/* ══ 왼쪽: 입력 폼 ══ */}
          <div style={ov.formSide}>
            {/* ★ 카드 언어 탭 + DeepL 번역 */}
            <div style={{ padding: 10, background: "rgba(240,196,0,0.07)", borderRadius: 8, border: "1px solid rgba(240,196,0,0.25)", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#f0c400", letterSpacing: 1 }}>🌏 카드 언어</span>
                <button onClick={handleTranslate} disabled={translating}
                  title="한국어 내용을 일본어 · 영어로 자동 번역"
                  style={{ ...ov.transBtn, opacity: translating ? 0.5 : 1 }}>
                  {translating ? "번역 중..." : "🌐 DeepL 자동번역"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {LANGS.map(l => (
                  <button key={l.id} onClick={() => set("lang", l.id)} style={tabBtn(form.lang === l.id)}>
                    {l.flag} {l.label}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 10, color: "#888", margin: "6px 0 0", lineHeight: 1.5 }}>
                🇰🇷 한국어로 입력 → 🌐 번역 → 탭 눌러 확인 후 각각 저장
              </p>
            </div>

            {/* 사진 */}
            <label style={ov.label}>{t.photo}</label>
            <input type="file" accept="image/*" onChange={handlePhoto} style={{ marginBottom: 6, fontSize: 11, width: "100%" }} />
            {form.photo && (
              <div style={{ marginBottom: 6 }}>
                <label style={{ ...ov.label, margin: "4px 0 2px" }}>{t.facePos} ({form.photoPos}%)</label>
                <input type="range" min={0} max={100} value={form.photoPos}
                  onChange={e => set("photoPos", +e.target.value)} style={{ width: "100%" }} />
              </div>
            )}

            {/* 로고 */}
            <label style={ov.label}>{t.logo}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              {form.logo && (
                <img src={form.logo} alt="" style={{ height: 30, width: 30, objectFit: "contain", borderRadius: 4, background: "#000", padding: 2 }} />
              )}
              <button onClick={toggleDefaultLogo} style={{ ...tabBtn(form.useDefaultLogo), flex: 1, fontSize: 11 }}>
                {form.useDefaultLogo ? "✓ " : ""}{t.useDefaultLogo}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input type="file" accept="image/*" onChange={handleLogo} style={{ flex: 1, fontSize: 11, minWidth: 0 }} />
              {form.logo && !form.useDefaultLogo && (
                <button onClick={() => set("logo", null)}
                  style={{ background: "none", border: "none", color: "#f55", cursor: "pointer", fontSize: 15 }}>✕</button>
              )}
            </div>

            {/* 기본 정보 */}
            <label style={ov.label}>{t.basic}</label>
            <input style={ov.input} placeholder={t.name} value={cur.name} onChange={e => setText("name", e.target.value)} />
            <div style={{ display: "flex", gap: 6 }}>
              <input style={ov.input} placeholder={t.age} value={form.age} onChange={e => set("age", e.target.value)} />
              <input style={ov.input} placeholder={t.job} value={cur.job} onChange={e => setText("job", e.target.value)} />
            </div>

            {/* 피지컬 */}
            <label style={ov.label}>{t.physical}</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={ov.input} placeholder={t.height} value={form.height} onChange={e => set("height", e.target.value)} />
              <input style={ov.input} placeholder={t.size} value={cur.cupSize} onChange={e => setText("cupSize", e.target.value)} />
              <input style={ov.input} placeholder={t.weight} value={form.weight} onChange={e => set("weight", e.target.value)} />
            </div>

            {/* 소개 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 6 }}>
              <label style={{ ...ov.label, margin: 0, flexShrink: 0 }}>{t.intro}</label>
              <button onClick={handleRandom} style={ov.randomBtn}>{t.random}</button>
            </div>
            <input style={{ ...ov.input, marginTop: 4 }} placeholder={t.charm} value={cur.charm} onChange={e => setText("charm", e.target.value)} />
            <textarea style={{ ...ov.input, height: 60, resize: "none" }} placeholder={t.bio} value={cur.bio} onChange={e => setText("bio", e.target.value)} />
            <input style={ov.input} placeholder={t.hobbies} value={cur.hobbies} onChange={e => setText("hobbies", e.target.value)} />

            {/* 업체명 */}
            <label style={ov.label}>{t.brand}</label>
            <input style={ov.input} placeholder="BANADA" value={form.brandName} onChange={e => set("brandName", e.target.value)} />

            {/* 템플릿 */}
            <label style={ov.label}>{t.style}</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {TEMPLATES.map(tpl => (
                <button key={tpl.id} onClick={() => set("template", tpl.id)} style={{ ...tabBtn(form.template === tpl.id), padding: "8px 4px" }}>
                  {tpl.label}<br />
                  <span style={{ fontSize: 9, fontWeight: 400 }}>{tpl.hint.ko}</span>
                </button>
              ))}
            </div>

            <button onClick={handleDownload} disabled={saving} style={{ ...ov.downloadBtn, opacity: saving ? 0.5 : 1 }}>
              {saving ? t.saving : t.save}
            </button>
          </div>

          {/* ══ 오른쪽: 카드 미리보기 ══ */}
          <div style={ov.previewSide}>
            <div style={{ width: "100%", textAlign: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#f0c400", letterSpacing: 1, background: "rgba(240,196,0,0.12)", padding: "4px 12px", borderRadius: 20 }}>
                {LANGS.find(l => l.id === form.lang)?.flag} {LANGS.find(l => l.id === form.lang)?.label} 카드
              </span>
            </div>
            <div ref={cardRef} style={C.card}>
              {/* Stripe 헤더 */}
              {isStripe && (
                <div style={C.stripeHead}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {form.logo && <img src={form.logo} alt="" style={C.stripeLogo} />}
                    {brand}
                  </span>
                  <span>{cardT.profile}</span>
                </div>
              )}

              {/* 사진 */}
              <div style={C.photo}>
                {form.photo ? (
                  <img src={form.photo} alt="" style={C.photoImg} />
                ) : (
                  <div style={C.emptyPhoto}>
                    <div style={C.watermark}>{brand}</div>
                    <Crescent size={28} color={isIvory ? "#12110e" : "#f0c400"} />
                    <span style={{ position: "relative", zIndex: 1 }}>{cardT.addPhoto}</span>
                  </div>
                )}
                <div style={C.veil} />
                {!isStripe && (
                  <div style={C.brandTag}>
                    {form.logo
                      ? <img src={form.logo} alt="" style={C.brandLogo} />
                      : <Crescent size={14} color="#f0c400" />}
                    {brand}
                  </div>
                )}
              </div>

              {/* 바디 */}
              <div style={C.body}>
                <h3 style={C.name}>{title || cardT.defaultName}</h3>
                {stats.length > 0 && <p style={C.stats}>{stats.join("  ·  ")}</p>}
                {cur.charm && <p style={C.charm}>{cur.charm}</p>}
                {cur.bio && <p style={C.bio}>{cur.bio}</p>}
                {hobbies.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 18 }}>
                    {hobbies.map((h, i) => <span key={i} style={C.tag}>{h}</span>)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────── 모달 레이아웃 ───────────
const ov = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" },
  container: { background: "#111", borderRadius: 16, width: "95vw", maxWidth: 880, maxHeight: "92vh", overflowY: "auto", border: "2px solid #f0c400" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #222", position: "sticky", top: 0, background: "#111", zIndex: 10 },
  closeBtn: { background: "#f0c400", color: "#000", border: "none", padding: "6px 16px", borderRadius: 8, fontWeight: 800, cursor: "pointer" },
  content: { display: "flex", gap: 24, padding: 20, flexWrap: "wrap" },
  formSide: { flex: 1, minWidth: 260 },
  previewSide: { display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "center", flex: "0 0 auto" },
  label: { display: "block", fontSize: 11, fontWeight: 800, color: "#f0c400", letterSpacing: "0.2em", textTransform: "uppercase", margin: "10px 0 4px" },
  input: { width: "100%", padding: "8px 10px", background: "#1a1a1a", color: "#eee", border: "1px solid #333", borderRadius: 6, fontSize: 13, marginBottom: 6, boxSizing: "border-box", outline: "none", fontFamily: "inherit" },
  transBtn: { background: "#2196F3", color: "#fff", border: "none", padding: "5px 10px", borderRadius: 6, fontWeight: 800, fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" },
  randomBtn: { background: "#f0c400", color: "#000", border: "none", padding: "5px 12px", borderRadius: 6, fontWeight: 800, fontSize: 11, cursor: "pointer" },
  downloadBtn: { width: "100%", padding: "14px", background: "#f0c400", color: "#000", border: "none", borderRadius: 10, fontWeight: 900, fontSize: 15, cursor: "pointer", marginTop: 10, letterSpacing: 1 },
};
