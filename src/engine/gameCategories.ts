import {
  Category,
  LevelInfo,
  Achievement,
  PowerUpDefinition,
  BattleCardDefinition,
  BoardThemeDefinition,
  TrailStyleDefinition,
  ExclusiveAvatarItem,
  NameGlowItem,
  EmotePackDefinition,
  PremiumPackDefinition,
  SeasonPassTier,
  MysteryBoxReward,
  PlayerProfile
} from '../types/game';

export const CATEGORIES: Category[] = [
  {
    id: 'kuwait_heritage',
    name: 'الكويت',
    englishName: 'Kuwait',
    icon: 'Landmark',
    description: 'أبراج الكويت، الفرجان القديمة، البوم، ومعالم الديرة',
    accentColor: '#0ea5e9',
    totalLevels: 50
  },
  {
    id: 'geography_world',
    name: 'معلومات عامة',
    englishName: 'General Knowledge',
    icon: 'Globe',
    description: 'ثقافة عامة، عواصم العالم، اختراعات، ومعارف متنوعة',
    accentColor: '#eab308',
    totalLevels: 50
  },
  {
    id: 'sports_championships',
    name: 'رياضة',
    englishName: 'Sports',
    icon: 'Trophy',
    description: 'كرة القدم، بطولات الخليج والعالم، وألعاب القوى',
    accentColor: '#f97316',
    totalLevels: 50
  },
  {
    id: 'animals_nature',
    name: 'أفلام ومسلسلات',
    englishName: 'Movies & Series',
    icon: 'Sparkles',
    description: 'مسلسلات كويتية وخليجية، مسرحيات، وسينما عربية وعالمية',
    accentColor: '#ec4899',
    totalLevels: 50
  },
  {
    id: 'science_space',
    name: 'تاريخ',
    englishName: 'History',
    icon: 'Landmark',
    description: 'حضارات قديمة، قلاع تاريخية، ومعارك وشخصيات خالدة',
    accentColor: '#d97706',
    totalLevels: 50
  },
  {
    id: 'islamic_values',
    name: 'دين وثقافة',
    englishName: 'Religion & Culture',
    icon: 'BookOpen',
    description: 'رمضان، مكة، المساجد التاريخية، والقيم الإسلامية',
    accentColor: '#14b8a6',
    totalLevels: 50
  },
  {
    id: 'food_cuisine',
    name: 'طعام',
    englishName: 'Food',
    icon: 'UtensilsCrossed',
    description: 'مجبوس، مطبق زبيدي، برجر، حلويات، وأطباق شهية',
    accentColor: '#ef4444',
    totalLevels: 50
  },
  {
    id: 'tech_future',
    name: 'تكنولوجيا',
    englishName: 'Technology',
    icon: 'Cpu',
    description: 'حواسيب، برمجة، ذكاء اصطناعي، وتقنيات المستقبل',
    accentColor: '#3b82f6',
    totalLevels: 50
  },
  {
    id: 'kuwait_proverbs',
    name: 'ألغاز ومعلومات',
    englishName: 'Puzzles & Trivia',
    icon: 'MessageCircle',
    description: 'ألغاز ذكية، أمثال شعبية، كلمات متقاطعة، وتحديات ذهنية',
    accentColor: '#06b6d4',
    totalLevels: 50
  }
];

export const PREMIUM_CATEGORIES: Category[] = [
  {
    id: 'kuwait_dialect_pro',
    name: 'تحدي اللهجة الكويتية العميق',
    englishName: 'Deep Kuwaiti Dialect',
    icon: 'Sparkles',
    description: 'مفردات كويتية أصيلة وتراثية نادرة لأهل الديرة والمحترفين',
    accentColor: '#f59e0b',
    totalLevels: 50
  },
  {
    id: 'gulf_theater_classics',
    name: 'كلاسيكيات المسرح الكويتي',
    englishName: 'Kuwaiti Theater Classics',
    icon: 'Trophy',
    description: 'مسرحيات خالدة وشخصيات كوميدية من الزمن الجميل في الكويت',
    accentColor: '#ec4899',
    totalLevels: 50
  }
];

export function findCategoryById(catId: string): Category {
  return (
    CATEGORIES.find(c => c.id === catId) ||
    PREMIUM_CATEGORIES.find(c => c.id === catId) ||
    CATEGORIES[0]
  );
}

// Rich Curated Word Pools for each Category
export const CATEGORY_WORD_POOLS: Record<string, { titles: string[]; pool: string[] }> = {
  kuwait_heritage: {
    titles: [
      'معالم الكويت الشهيرة', 'البحر والغوص القديم', 'سوق المباركية', 'السدو وحرف البادية', 'بوابات السور القديم',
      'جزيرة فيلكا التاريخية', 'ديوانيات الكويت', 'قصر السيف العامر', 'النوخذة والمجدمي', 'أبراج المياه التراثية',
      'متحف الكويت الوطني', 'حي المرقاب وجبلة', 'سفن البوم الشراعية', 'صيد اللؤلؤ والمحار', 'البيئة الصحراوية',
      'مركز الشيخ جابر الثقافي', 'سوق واجف القديم', 'براحة الميدان', 'دروازة الشامية', 'برج التحرير الشامخ',
      'جزيرة بوبيان ووربة', 'كوت ابن عريعر', 'الكويت القديمة', 'شاطئ الشويخ', 'بيت العثمان التراثي',
      'فن العرضة والسامري', 'العمارة الكويتية', 'رحلات الطواويش', 'صناعة القراقير', 'دسمان والميدان',
      'فرجان الكويت العتيقة', 'كشتات الربيع في البر', 'ألعاب شعبية قديمة', 'الروشنة والدريشة', 'المطار القديم',
      'مجلس الأمة الكويتي', 'محمية صباح الأحمد', 'رأس السالمية والبدع', 'صخور جال الزور', 'ميناء الشويخ',
      'نخيل القصر الأحمر', 'معركة الجهراء وتاريخها', 'أيام البحارة الكويتيين', 'السياحة في جون الكويت', 'القباب الخضراء',
      'أفراح التحرير والعيد', 'صوت النهام في البحر', 'المسجد الكبير', 'شروق الشمس في فيلكا', 'كويت الماضي والحاضر'
    ],
    pool: [
      'ابراج', 'كويت', 'سدو', 'بوم', 'فيلكا', 'مرقاب', 'جبله', 'دسمان', 'محار', 'لؤلؤ',
      'نوخذه', 'دروازه', 'مباركية', 'سيف', 'سامري', 'عرضه', 'شاميه', 'تحرير', 'ديوانيه', 'فرجان',
      'ناهام', 'طواش', 'قرقور', 'روشنه', 'دريشه', 'شوراع', 'بوبيان', 'وربه', 'مسجد', 'قصر',
      'جهراء', 'احمدي', 'سالميه', 'بدع', 'زور', 'جون', 'بحري', 'شويخ', 'ميدان', 'براحه',
      'واجف', 'صباح', 'عثمان', 'شراع', 'مجادمي', 'غيص', 'حبال', 'فنر', 'دوه', 'منقور'
    ]
  },
  kuwait_proverbs: {
    titles: [
      'مصطلحات شبابية كويتية', 'كلمات الدواوين', 'أمثال الأجداد', 'سوالف الطيبين', 'كلمات الترحيب والسنع',
      'عبارات المدح الكشخة', 'ذكريات الألعاب القديمة', 'فنتك وإبداع', 'كشخة أهل الديرة', 'مصطلحات الفريج',
      'الضحك والغشمرة', 'كلام سنع وموجب', 'أمثال بحرية', 'حزاوي كويتية قديمة', 'كلمات الغبقة',
      'قرقيعان وفرحة الأطفال', 'شربات وعصير بارد', 'حياكم الله بديرتكم', 'سالفة ورباطها', 'كلمات العصرية',
      'كشتة ووناسة', 'سوالف الطيبين', 'فزعة النشامى', 'حق الليلة والقرقيعان', 'أصول الضيافة',
      'كلمات البادية العريقة', 'المهلي ما يولي', 'ألف نعم بالربع', 'قعدة وشاي مخدر', 'سوالف البحر',
      'أمثال كويتية دارجة', 'ضحك ووناسة وسوالف', 'حماس الشباب', 'كفو وعاش النشامى', 'فخر وعزوة',
      'كلمات السفر والتجارة', 'صفات الرجل السنع', 'أيام البساطة والعفوية', 'قهوة عربية وهيل', 'مواقف طريفة',
      'حكمة الشيبان', 'كلمات البر والمكشات', 'علوم الرجال السنعة', 'عادات وتقاليد أصيلة', 'كلام راقي وكشخة',
      'أمثال كويتية شهيرة', 'تحيات وسلامات', 'سوالف الأحبة', 'فرحة العيد والجمعة', 'كويت العز والمحبة'
    ],
    pool: [
      'كشخه', 'فنتك', 'قزيز', 'غبقه', 'قرقيعان', 'شربات', 'حياك', 'سنع', 'غشمره', 'دريشه',
      'زواره', 'خنين', 'طاف', 'موجب', 'نشامى', 'كفو', 'فزعه', 'هبان', 'قدوع', 'حزاوي',
      'مخدر', 'قعده', 'سوالف', 'شاي', 'قهوه', 'هيل', 'زعفران', 'بخور', 'عطور', 'دله',
      'فنجان', 'ميداف', 'حبل', 'عويه', 'صرقعه', 'بشت', 'عقال', 'غتره', 'زبون', 'ثوب',
      'مشلح', 'نعال', 'سفره', 'صينيه', 'ملاس', 'جدر', 'طابي', 'تاوه', 'استكانه', 'بياله'
    ]
  },
  food_cuisine: {
    titles: [
      'المجبوس الكويتي الفاخر', 'مطبق السمك الشهي', 'حلويات كويتية أصيلة', 'ريوق الضحى والبلاليط', 'أطباق شتوية دافئة',
      'المموش والربيان اليابس', 'الهريس واليريش السنع', 'خبيصة وعصيدة الطيبين', 'مرقوقة الخضار واللحم', 'قبوط محشي باللحم',
      'المشويات واللحوم', 'سمك الصبور المشوي', 'الميد والشعم الطازج', 'خبز الرقاق والفلزي', 'البهارات والحوايج',
      'شاي الكرك والزعفران', 'القيمات الذهبية المقرمشة', 'بيض وطماط كويتي', 'شوربة العدس اللذيذة', 'أكلات رمضانية شهيرة',
      'العيش المشخول والزعفران', 'ميدم وسمك صافي', 'سلطات ومقبلات كويتية', 'دبس التمر والرهش', 'درابيل وسكر ناعم',
      'بقصم وحليب دافئ', 'زلابيا وغريبة ناعمة', 'محاشي وخضار طازجة', 'مرق بامية باللحم', 'مرق شبزي وخضار',
      'مطازيز وقبوط كويتي', 'كبسة اللحم الشهية', 'ربيان طري مقلي', 'حمسة روبيان وبصل', 'مشروبات الصيف الباردة',
      'عصير الليمون بالنعناع', 'لبن خاثر ومخللات', 'مكسرات ومحمصات', 'تمرات وإخلاص وسكري', 'فطور العيد المبارك',
      'حلويات الزوارة الأسبوعية', 'وجبات الديوانية الشعبية', 'أطايب البحر والخليج', 'سفرة كويتية عامرة', 'نكهة السمن العداني',
      'طبخات الجدر الكويتي', 'مأكولات كويتية تراثية', 'ألذ النكهات الخليجية', 'سهرات الشاي والقهوة', 'أكلات العافية والبركة'
    ],
    pool: [
      'مجبوس', 'مطبق', 'زبيدي', 'مموش', 'خبيصه', 'بلاليط', 'هريس', 'يريش', 'مرقوقه', 'قبوط',
      'صبور', 'ميد', 'شعم', 'هامور', 'نويبي', 'بالول', 'ربيان', 'زعفران', 'هيل', 'دارسين',
      'كركم', 'سمن', 'عداني', 'رهش', 'درابيل', 'بقصم', 'قيمات', 'زلابيا', 'غريبه', 'كرك',
      'مشخول', 'حمسه', 'خاثر', 'تمرات', 'بامية', 'شبزي', 'سلطه', 'مخلل', 'ليمون', 'نعناع',
      'قرص', 'رقاق', 'طماط', 'بصل', 'ثوم', 'كزبره', 'فلفل', 'محشي', 'شوربه', 'عدس'
    ]
  },
  animals_nature: {
    titles: [
      'صقور الخليج الحرة', 'طيور الساحل الكويتي', 'حيوانات الصحراء العربية', 'الكائنات البحرية بالخليج', 'الخيول العربية الأصيلة',
      'الزواحف والبرمائيات', 'النباتات الصحراوية البرية', 'طيور الربيع المهاجرة', 'الغزلان والمها العربي', 'حشرات ونحل البراري',
      'عالم الدلافين والحيتان', 'الطيور الجارحة القوية', 'جمال الإبل وسفن الصحراء', 'الأشجار المعمرة', 'أسماك الشعاب المرجانية',
      'الذئاب والثعالب الصحراوية', 'أزهار النوير الصفراء', 'العقارب والعناكب البرية', 'السلاحف البحرية الخضراء', 'طيور النورس البحرية',
      'الجراد واليعاسيب', 'طائر الوروار الملون', 'حيوان الضب الصحراوي', 'اليربوع الصغير وسرعته', 'الفهد الصياد العربي',
      'طائر القطا البري', 'طيور الفلامنجو الوردية', 'الأخطبوط ونجم البحر', 'الشعاب المرجانية الملونة', 'عشائر النمل والنحل',
      'نبات العرفج الوطني', 'شجيرات الرمث والأثل', 'فراشات الحدائق الجميلة', 'طائر الهدهد الشهير', 'النسور والعقبان',
      'حيوانات المحميات الطبيعية', 'الحرباء وتلونها العجيب', 'قنديل البحر والسرطان', 'الأغنام والماعز بالبادية', 'عالم الطيور المغردة',
      'أفراس ومهور السباق', 'عصافير الدوري والبلبل', 'ثعبان الصحراء والصل', 'خفافيش الكهوف الليلية', 'طيور الكروان والوز',
      'بط البرك والبحيرات', 'الوشق وسنور الرمال', 'الأرانب البرية السريعة', 'طبيعة الكويت الفطرية', 'تنوع الحياة البيئية'
    ],
    pool: [
      'صقر', 'حباري', 'جمل', 'غزال', 'دلفين', 'عقاب', 'خيل', 'وعل', 'شاهين', 'قطا',
      'نوير', 'عرفج', 'رمث', 'ضب', 'يربوع', 'فلامنجو', 'نورس', 'سلحفاه', 'اخطبوط', 'حوت',
      'ثعلب', 'ذئب', 'حرباء', 'هدهد', 'كروان', 'بلبل', 'ارنب', 'حصان', 'مهره', 'مها',
      'ريم', 'سرطان', 'نجم', 'مرجان', 'نحل', 'فراشه', 'عقرب', 'عنكبوت', 'نسر', 'بط',
      'وز', 'وروار', 'وشق', 'سنور', 'اثل', 'شري', 'حوذان', 'ثعبان', 'خفاش', 'دوري'
    ]
  },
  geography_world: {
    titles: [
      'عواصم دول الخليج', 'عواصم الدول العربية', 'قارات ومحيطات العالم', 'أكبر جزر كوكب الأرض', 'سلاسل جبال شاهقة',
      'أطول أنهار العالم', 'بحار ومضائق حيوية', 'دول قارة آسيا', 'دول قارة أوروبا', 'دول قارة إفريقيا',
      'أمريكا الشمالية والجنوبية', 'صحاري العالم الكبرى', 'مدن سياحية عالمية', 'أشهر الموانئ البحرية', 'بحيرات عذبة عملاقة',
      'دول شبه الجزيرة العربية', 'شلالات وغابات استوائية', 'أرخبيل الجزر الجميلة', 'العواصم التاريخية القديمة', 'عجائب الطبيعة الجغرافية',
      'مضيق هرمز وباب المندب', 'قناة السويس وبنما', 'جبال الهيمالايا والألب', 'نهر النيل والفرات', 'بحر العرب والأحمر',
      'دول حوض البحر المتوسط', 'مناخات وتضاريس الأرض', 'القطب الشمالي والجنوبي', 'الجزر الكاريبية الساحرة', 'دول غرب إفريقيا',
      'دول أوروبا الشرقية', 'دول جنوب شرق آسيا', 'مدن الأندلس التاريخية', 'سهول ووديان خضراء', 'براكين وجزر بركانية',
      'عواصم الدول الكبرى', 'أنهار أوروبا الشهيرة', 'جبال الأطلس العربية', 'واحات الصحراء الكبرى', 'موانئ الخليج العربي',
      'معالم جغرافية بارزة', 'دول حزام المحيط الهادئ', 'جزر المحيط الهندي', 'دول الشمال الأوروبي', 'دول قارة أوقيانوسيا',
      'مدن التراث العالمي', 'أكبر دول العالم مساحة', 'تنوع تضاريس الكرة الأرضية', 'أسرار الخرائط والحدود', 'رحلة حول كوكب الأرض'
    ],
    pool: [
      'كويت', 'رياض', 'دوحه', 'منامه', 'مسقط', 'ابوظبي', 'قاهره', 'بغداد', 'دمشق', 'عمان',
      'بيروت', 'رباط', 'تونس', 'جزائر', 'خرطوم', 'قدس', 'صنعاء', 'طرابلس', 'نيل', 'فرات',
      'دجله', 'هرمز', 'سويس', 'هيمالايا', 'اطلس', 'الب', 'صحراء', 'محيط', 'بحر', 'قاره',
      'اسيا', 'اوروبا', 'افريقيا', 'امريكا', 'يابان', 'صين', 'هند', 'تركيا', 'يونان', 'ايطاليا',
      'فرنسا', 'المانيا', 'اسبانيا', 'لندن', 'باريس', 'روما', 'مدريد', 'طوكيو', 'بكين', 'دلهي'
    ]
  },
  science_space: {
    titles: [
      'كواكب المجموعة الشمسية', 'نجوم ومجرات الكون', 'أجزاء الذرة والمادة', 'الطاقة وتوليد الكهرباء', 'الجاذبية وحركة الأجرام',
      'طبقات الغلاف الجوي', 'عناصر الجدول الدوري', 'التلسكوبات والمراصد', 'المذنبات والنيازك السابحة', 'سرعة الضوء والموجات',
      'محطة الفضاء الدولية', 'علوم الأحياء والجينات', 'رواد الفضاء والمركبات', 'القمر ومراحله ومنازله', 'الشمس والانفجارات الشمسية',
      'الفيزياء وقوانين نيوتن', 'الكيمياء والتفاعلات', 'الضوء والألوان الطيفية', 'المغناطيسية والمجال الأرضي', 'المناخ وظاهرة الاحتباس',
      'أعماق البحار والمحيطات', 'الأقمار الصناعية والمدارات', 'البيئة والطاقة المتجددة', 'الخلية وعلم الوراثة', 'المجهر والكائنات الدقيقة',
      'الصوت والترددات الصوتية', 'الرياح ودورة المياه', 'الضغط الجوي والحرارة', 'الثقوب السوداء الغامضة', 'سدم الفضاء وألوانها',
      'تاريخ استكشاف الفضاء', 'علوم الجيولوجيا والصخور', 'الزلازل والبراكين النشطة', 'الليزر وتطبيقاته الحديثة', 'عالم النانو متناهي الصغر',
      'علوم الفلك عند العرب', 'الشهب وشهب البرشاويات', 'مركبات الهبوط على المريخ', 'التفاعلات النووية النظيفة', 'المادة المظلمة في الكون',
      'حركة الكواكب والمدارات', 'العدسات والمجاهر البصرية', 'علم النبات والتمثيل الضوئي', 'الكيمياء العضوية المدهشة', 'أجهزة الرصد والتنبؤ',
      'قوانين الديناميكا الحرارية', 'الموجات الكهرومغناطيسية', 'عجائب الفضاء السحيق', 'رحلة العلم والمعرفة', 'مستقبل الاستكشاف العلمي'
    ],
    pool: [
      'شمس', 'قمر', 'كوكب', 'مجره', 'نجم', 'نيزك', 'شهاب', 'مذنب', 'مدار', 'جاذبيه',
      'ضوء', 'صوت', 'ذره', 'نواه', 'الكترون', 'بروتون', 'طاقه', 'ليزر', 'تلسكوب', 'مرصد',
      'صاروخ', 'فضاء', 'هيدروجين', 'اوكسجين', 'كربون', 'حديد', 'ذهب', 'فضه', 'حراره', 'ضغط',
      'سرعه', 'موجات', 'طيف', 'عدسه', 'مجهر', 'خليه', 'جينات', 'وراثه', 'تفاعل', 'مغناطيس',
      'سديم', 'مريخ', 'مشتري', 'زحل', 'زهره', 'عطارد', 'اورانوس', 'نبتون', 'ارض', 'غلاف'
    ]
  },
  islamic_values: {
    titles: [
      'أركان الإسلام الخمسة', 'شهر رمضان المبارك', 'الحج ومناسكه العظيمة', 'مكة المكرمة والبيت الحرام', 'المدينة المنورة وطيبة',
      'أخلاق المؤمن وإحسانه', 'القرآن الكريم وسوره', 'الصلاة والخشوع والسكينة', 'الصدقة والزكاة والبركة', 'صيام النوافل والأجر',
      'صلة الرحم وبر الوالدين', 'الأمانة والصدق في القول', 'التواضع ولين الجانب', 'العفو والتسامح بين الناس', 'ذكر الله والاستغفار',
      'الدعاء في الثلث الأخير', 'آداب المسجد والجمعة', 'عمرة رمضان وفضلها', 'غار حراء ونزول الوحي', 'مسجد قباء وتاريخه',
      'الصحابة الأجلاء الكرام', 'غزوات وسيرة نبوية', 'بئر زمزم والماء المبارك', 'جبل أحد وجبل النور', 'الأذان والنداء المبارك',
      'ليلة القدر المباركة', 'العيد وفرحة المسلمين', 'التكبير والتهليل والتحميد', 'الصبر عند الشدائد', 'شكر النعم وحمد الله',
      'آداب الطعام والشراب', 'إماطة الأذى عن الطريق', 'كفالة اليتيم والإحسان', 'العدل والإنصاف بين العباد', 'العلم النافع والعمل به',
      'حلقات تحفيظ القرآن', 'حفظ اللسان عن الزلل', 'الرفق بالحيوان والضعيف', 'حسن الجوار والمودة', 'إفشاء السلام بين الناس',
      'النية الصالحة والإخلاص', 'صلوات التطوع والسنن', 'سجدة الشكر والتضرع', 'قيم التكافل والتراحم', 'الأخوة الإيمانية الصادقة',
      'الوفاء بالعهود والمواثيق', 'طهارة القلب وسلامة الصدر', 'نور الإيمان والهدى', 'طريق الجنة والنعيم', 'بركات الدين والتقوى'
    ],
    pool: [
      'رمضان', 'صيام', 'قيام', 'قران', 'صلاه', 'زكاه', 'حج', 'عمره', 'مكه', 'مدينه',
      'زمزم', 'احسان', 'امانه', 'صدق', 'صبر', 'شكر', 'دعاء', 'استغفار', 'تسبيح', 'تهليل',
      'تكبير', 'مسجد', 'اذان', 'اقامه', 'ركوع', 'سجود', 'طواف', 'سعي', 'عرفات', 'منى',
      'مزدلفه', 'صفا', 'مروه', 'قدر', 'بركه', 'تقوى', 'اخلاص', 'عفو', 'رحمه', 'موده',
      'سلام', 'طاعه', 'جنه', 'هدى', 'نور', 'ايمان', 'بر', 'صله', 'خشوع', 'طهاره'
    ]
  },
  sports_championships: {
    titles: [
      'كرة القدم وعشق الجماهير', 'كأس الخليج العربي', 'كأس العالم والنهائيات', 'دوري أبطال آسيا وأوروبا', 'الألعاب الأولمبية الكبرى',
      'كرة السلة ورميات الثلاثية', 'كرة الطائرة على الشاطئ', 'رياضة التنس والمضرب', 'السباحة والسباقات المائية', 'ألعاب القوى والسرعة',
      'الرماية وإصابة الهدف', 'سباقات الهجن التراثية', 'الفروسية وقفز الحواجز', 'الملاكمة والفنون القتالية', 'رياضة الجودو والتايكوندو',
      'كمال الأجسام واللياقة', 'سباقات الجري والماراثون', 'الدراجات الهوائية والسرعة', 'رياضة الجمباز والرشاقة', 'سباقات سيارات الفورمولا',
      'التزلج على الجليد والماء', 'كرة اليد وأهدافها الحاسمة', 'تنس الطاولة وردود الفعل', 'رياضة الكريكت والبيسبول', 'الجولف والملاعب الخضراء',
      'رياضة البادل الشهيرة', 'الريشة الطائرة والخفة', 'تسلق الجبال والمغامرة', 'التجديف والقوارب السريعة', 'الصيد البحري والغوص الرياضي',
      'مدرب الفريق وتكتيكاته', 'حارس المرمى وتصدياته', 'الهداف وركلات الجزاء', 'الحكم الصارم وقراراته', 'المدرجات وهتاف المشجعين',
      'الميدالية الذهبية والفوز', 'منصة التتويج والأبطال', 'اللياقة البدنية والصحة', 'التغذية الرياضية السليمة', 'الإحماء قبل التمارين',
      'الروح الرياضية والمنافسة', 'معسكرات التدريب الصيفية', 'المباريات الودية والحماس', 'الوقت الإضافي وركلات الترجيح', 'ضربة البداية وانطلاق الصافرة',
      'الملعب الأخضر والخطوط', 'كأس البطولة وفرحة الفوز', 'الأرقام القياسية العالمية', 'أبطال الكويت وإنجازاتهم', 'شغف الرياضة والبطولات'
    ],
    pool: [
      'كره', 'هدف', 'مرمى', 'حارس', 'مدرب', 'حكم', 'كاس', 'بطوله', 'دوري', 'ملعب',
      'شوط', 'صفاره', 'جزاء', 'تسلل', 'هجوم', 'دفاع', 'وسط', 'جناح', 'تمريره', 'تسديده',
      'ذهبيه', 'فضيه', 'برونزيه', 'منصه', 'بطل', 'سرعه', 'لياقه', 'قوه', 'رشاقه', 'تحمل',
      'سباق', 'ماراثون', 'قفز', 'رمي', 'سباحه', 'رمايه', 'فروسيه', 'تنس', 'بادل', 'سله',
      'طائره', 'يد', 'ملاكمه', 'جودو', 'جمباز', 'دراجات', 'تجديف', 'هجن', 'مضرب', 'شبكه'
    ]
  },
  tech_future: {
    titles: [
      'عالم الحواسيب والعتاد', 'الذكاء الاصطناعي التوليدي', 'لغات البرمجة والأكواد', 'شبكات الإنترنت والسحاب', 'الأمن السيبراني وحماية البيانات',
      'الهواتف الذكية والتطبيقات', 'روبوتات المستقبل الذكية', 'قواعد البيانات والخوادم', 'تطوير مواقع الويب الحديثة', 'معالجات السيليكون الدقيقة',
      'إنترنت الأشياء والمنازل', 'الواقع الافتراضي والمعزز', 'تخزين البيانات والذواكر', 'الخوارزميات وحل المشكلات', 'المركبات ذاتية القيادة',
      'تقنيات الطباعة ثلاثية الأبعاد', 'سلاسل الكتل والأمان الرقمي', 'التجارة الإلكترونية والمنصات', 'الشاشات عالية الدقة', 'أنظمة التشغيل المفتوحة',
      'الحوسبة الكمية الفائقة', 'الطائرات المسيرة والدرون', 'منصات البث السحابي', 'تقنيات الاتصال والجيل الخامس', 'التشفير وحماية الخصوصية',
      'تصميم واجهات المستخدم', 'اختبار البرمجيات وضمان الجودة', 'أتمتة الأعمال والعمليات', 'التعلم الآلي والبيانات الضخمة', 'محركات البحث السريعة',
      'الأجهزة القابلة للارتداء', 'الطاقة النظيفة للمراكز الرقمية', 'الكاميرات الرقمية والحساسات', 'المساعدات الصوتية الذكية', 'ألعاب الفيديو والجرافيكس',
      'المكتبات البرمجية والأطر', 'حوسبة الحافة والسرعة الفائقة', 'الرقمنة والتحول الإلكتروني', 'مراكز البيانات العملاقة', 'الابتكار وريادة الأعمال',
      'الهندسة العكسية والتحليل', 'الشبكات العصبية الاصطناعية', 'الواقع المختلط والتفاعل', 'المدن الذكية والمستدامة', 'الرعاية الصحية الرقمية',
      'تقنيات الرؤية الحاسوبية', 'الحلول السحابية الهجينة', 'الأقمار الصناعية للاتصالات', 'عصر التكنولوجيا المشرق', 'مستقبل الذكاء الرقمي'
    ],
    pool: [
      'حاسوب', 'معالج', 'ذاكره', 'قرص', 'لوحه', 'شاشه', 'فاره', 'شبكه', 'خادم', 'سحاب',
      'انترنت', 'موقع', 'تطبيق', 'شفرة', 'برمجه', 'كود', 'بيانات', 'ذكاء', 'روبوت', 'خوارزم',
      'امان', 'تشفير', 'خصوصيه', 'جدار', 'فيروس', 'بكسل', 'كاميرا', 'حساس', 'درون', 'طابعه',
      'هاتف', 'لوحي', 'اتصال', 'لاسلكي', 'بلوتوث', 'الياف', 'ضوئيه', 'نظام', 'واجهه', 'منصه',
      'محرك', 'بحث', 'تطوير', 'تجربه', 'تحليل', 'تعليم', 'الي', 'عصبي', 'سريع', 'ذكي'
    ]
  },
  kuwait_dialect_pro: {
    titles: Array.from({ length: 50 }, (_, i) => `تحدي اللهجة الأصيلة — مرحلة ${i + 1}`),
    pool: [
      'دريشه', 'روشنه', 'حوش', 'ليوان', 'سموه', 'غبقات', 'قرقيعان', 'هبان', 'مطراش', 'سراج',
      'كشتة', 'غشمره', 'فنتك', 'طربال', 'قرقور', 'نوخذه', 'ميداف', 'بشتخته', 'منحاز', 'سفرطاس',
      'دله', 'استكانه', 'ملاس', 'طابي', 'زبيدي', 'شعم', 'مجبوس', 'مموش', 'خبيصه', 'بلاليط',
      'رهش', 'درابيل', 'زلابيا', 'سمن', 'عداني', 'بخور', 'مرش', 'مبخر', 'عقال', 'غتره',
      'بشت', 'دشداشه', 'سدو', 'فرجان', 'براحة', 'دروازه', 'فيلكا', 'وربه', 'بوبيان', 'ابراج'
    ]
  },
  gulf_theater_classics: {
    titles: Array.from({ length: 50 }, (_, i) => `مسرح الكويت الخالد — فصل ${i + 1}`),
    pool: [
      'مسرح', 'فكاهه', 'ضحك', 'خشبه', 'ستاره', 'جمهور', 'تصفيق', 'مشهد', 'فصل', 'حوار',
      'بطوله', 'نجم', 'كوميديا', 'دراما', 'تراث', 'سالميه', 'حولي', 'شاميه', 'دسمه', 'كيفان',
      'موال', 'سامري', 'عرضه', 'فنون', 'شاشه', 'سينما', 'تلفاز', 'مخرج', 'ممثل', 'كواليس',
      'ابراج', 'كويت', 'غشمره', 'سوالف', 'وناسه', 'ديوانيه', 'رمضان', 'عيد', 'فرحه', 'سهره',
      'كشخه', 'فنتك', 'طرب', 'عود', 'نغم', 'صوت', 'صدى', 'ابداع', 'اسطوره', 'ذهب'
    ]
  }
};

// Generates a deterministic list of words for each of the 450 levels
export function getLevelConfig(categoryId: string, levelNumber: number): LevelInfo {
  const categoryData = CATEGORY_WORD_POOLS[categoryId] || CATEGORY_WORD_POOLS.kuwait_heritage;
  const levelIdx = Math.max(1, Math.min(50, levelNumber)) - 1;
  const title = categoryData.titles[levelIdx] || `مرحلة ${levelNumber}`;

  // Grid size and word count rules from specification:
  // 1-10: 8x8, 5 words
  // 11-30: 10x10, 7 words
  // 31-50: 12x12, 9 words
  let gridSize = 8;
  let wordCount = 5;

  if (levelNumber >= 31) {
    gridSize = 12;
    wordCount = 9;
  } else if (levelNumber >= 11) {
    gridSize = 10;
    wordCount = 7;
  }

  // Deterministically pick distinct words from the pool using seeded pseudo-random selection
  const pool = categoryData.pool;
  const seed = (categoryId.charCodeAt(0) * 100) + levelNumber * 17;
  let selectedWords: string[] = [];

  if (categoryId === 'kuwait_heritage' && levelNumber === 1) {
    selectedWords = ['أبراج', 'شاطئ', 'متحف', 'قصر', 'سوق'];
  } else {
    const usedIndices = new Set<number>();
    for (let i = 0; i < wordCount; i++) {
      let index = (seed + i * 7 + (levelNumber * 3)) % pool.length;
      let attempts = 0;
      while (usedIndices.has(index) && attempts < pool.length) {
        index = (index + 1) % pool.length;
        attempts++;
      }
      usedIndices.add(index);
      selectedWords.push(pool[index]);
    }
  }

  return {
    levelNumber,
    title,
    gridSize,
    wordCount,
    words: selectedWords,
    unlocked: levelNumber === 1,
    completed: false,
    stars: 0
  };
}

// Picks a fresh random set of words for a given category (used in Online Word Race & Rematch)
export function getRandomCategoryWords(categoryId: string, wordCount = 7): string[] {
  const categoryData = CATEGORY_WORD_POOLS[categoryId] || CATEGORY_WORD_POOLS.kuwait_heritage;
  const candidates = categoryData.pool.filter(w => w.length <= 8);
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(wordCount, shuffled.length));
}

// Kuwaiti Dialect Feedback Messages
export const KUWAITI_PRAISES = [
  'يا وحش! عيني عليك باردة 🔥',
  'كفووو والله! جبتها عالطاير ⚡',
  'فنان يا بطل! استمر يا الذيب 🏆',
  'عاش من جابها! نظرة صقر 🦅',
  'ما شاء الله عليك، شاطر وسنع! ✨',
  'شعللت اللعبة يا الحبيب! 🚀',
  'هذا اللعب السنع ولا بلاش! 💯',
  'يا عيني عليك! سرعة وذكاء 🎯',
  'كفو يا ولد الديرة! فخرنا 🌟',
  'ما يطوفك شي يا الذكي! 👏'
];

export const KUWAITI_MISTAKES = [
  'ما عليه، ركّز شوي وبتجيبها! 😉',
  'حاول ثانية، الكلمة قريبة منك 🔍',
  'لا تستعجل يا الحبيب، فتّش عدل 👀',
  'قربت وايد! دوّر بالاتجاه الثاني 🧭',
  'شد حيلك يا البطل، وراك جولات! 💪'
];

export const KUWAITI_HINT_MESSAGES = [
  'عطيتك طرف الخيط، كمّل الباقي يا بطل! 💡',
  'شوف الحرف اللي ينور، هناك السر! ✨',
  'التلميح يقولك ركّز بهالمكان 👀',
  'ولا يهمك، فتّشها من هالنقطة 🎯'
];

export const ACHIEVEMENT_GROUPS = [
  { id: 'EXPLORATION', label: 'الاستكشاف', desc: 'اكتشاف الكلمات والغوص في المعاني' },
  { id: 'SPEED', label: 'السرعة', desc: 'إنهاء المراحل في أوقات قياسية' },
  { id: 'ACCURACY', label: 'الدقة', desc: 'إنهاء المراحل دون أخطاء أو تلميحات' },
  { id: 'CHALLENGE', label: 'التحدي', desc: 'الانتصار في المباريات والتحديات التنافسية' },
  { id: 'CONSISTENCY', label: 'الاستمرارية', desc: 'المواظبة اليومية والسلسلة المتواصلة' }
] as const;

export const PLAYER_TITLES: import('../types/game').PlayerTitleItem[] = [
  {
    id: 'title_letter_explorer',
    name: 'مستكشف الحروف',
    description: 'لقب يمنح لمن يبدأ رحلة البحث واكتشاف الكلمات في فتّشها',
    unlockRequirement: 'مفتوح مجاناً أو باكتشاف أول 100 كلمة',
    coinPrice: 0,
    badgeColor: '#38bdf8'
  },
  {
    id: 'title_word_hunter',
    name: 'صائد الكلمات',
    description: 'لقب القناص الذي يصيد الكلمات الصعبة بدقة واحترافية',
    unlockRequirement: 'اكتشف 500 كلمة أو اشترِ من المتجر',
    coinPrice: 250,
    badgeColor: '#a3e635'
  },
  {
    id: 'title_speed_king',
    name: 'ملك السرعة',
    description: 'لقب البرق لمن ينهي المراحل في وقت قياسي قبل الجميع',
    unlockRequirement: 'أنهِ مرحلة خلال أقل من 30 ثانية أو اشترِ من المتجر',
    coinPrice: 350,
    badgeColor: '#f59e0b'
  },
  {
    id: 'title_kuwait_hero',
    name: 'بطل الكويت',
    description: 'وسام الفخر لأبطال التحديات والمباريات التنافسية',
    unlockRequirement: 'افُز في 10 مباريات أو اشترِ من المتجر',
    coinPrice: 500,
    badgeColor: '#10b981'
  },
  {
    id: 'title_fatteshha_legend',
    name: 'أسطورة فتّشها',
    description: 'أعلى لقب ملكي في اللعبة لأصحاب الإنجازات الخارقة',
    unlockRequirement: 'اكتشف 1000 كلمة أو افُز في 100 مباراة أو اشترِ من المتجر',
    coinPrice: 900,
    badgeColor: '#ec4899'
  }
];

export const COSMETIC_ITEMS: import('../types/game').CosmeticItem[] = [
  {
    id: 'frame_kuwait_gold',
    name: 'إطار الذهب الكويتي',
    type: 'AVATAR_FRAME',
    description: 'إطار ذهبي ملكي متوهج حول صورتك الرمزية',
    previewGradient: 'linear-gradient(135deg, #fde047 0%, #eab308 50%, #a16207 100%)',
    borderColor: '#facc15',
    coinPrice: 200,
    unlockAchievementId: 'exp_100'
  },
  {
    id: 'frame_neon_emerald',
    name: 'إطار النيون الزمردي',
    type: 'AVATAR_FRAME',
    description: 'إطار نيون أخضر ساطع يميزك في الغرف ولوحة الصدارة',
    previewGradient: 'linear-gradient(135deg, #a3e635 0%, #10b981 100%)',
    borderColor: '#a3e635',
    coinPrice: 300,
    unlockAchievementId: 'spd_record_30'
  },
  {
    id: 'frame_diamond_towers',
    name: 'إطار أبراج الكويت الماسي',
    type: 'AVATAR_FRAME',
    description: 'إطار ماسي سماوي مستوحى من إضاءة أبراج الكويت ليلاً',
    previewGradient: 'linear-gradient(135deg, #67e8f9 0%, #0284c7 100%)',
    borderColor: '#38bdf8',
    coinPrice: 400,
    unlockAchievementId: 'acc_perfect_5'
  },
  {
    id: 'frame_royal_legend',
    name: 'إطار أسطورة فتّشها الناري',
    type: 'AVATAR_FRAME',
    description: 'إطار ناري أرجواني حصري لنخبة أبطال فتّشها',
    previewGradient: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 50%, #8b5cf6 100%)',
    borderColor: '#ec4899',
    coinPrice: 650,
    unlockAchievementId: 'chl_wins_50'
  }
];

export const HINT_DEFINITIONS: import('../types/game').HintDefinition[] = [
  {
    id: 'SINGLE_LETTER',
    name: 'كشف حرف واحد',
    description: 'يُظهر موقع حرف واحد من كلمة غير مكتشفة على الشبكة',
    hintCost: 1,
    coinCost: 25,
    badge: 'حرف ١'
  },
  {
    id: 'WORD_START',
    name: 'إظهار مكان بداية الكلمة',
    description: 'يحدد ويضيء نقطة البداية (الحرف الأول) لكلمة متبقية',
    hintCost: 1,
    coinCost: 35,
    badge: 'بداية الكلمة'
  },
  {
    id: 'WORD_LENGTH',
    name: 'إظهار عدد الحروف',
    description: 'يعرض عدد حروف كل كلمة متبقية واتجاه البحث عنها',
    hintCost: 1,
    coinCost: 30,
    badge: 'عدد الحروف'
  },
  {
    id: 'REMOVE_UNUSED',
    name: 'إزالة الحروف غير المستخدمة',
    description: 'يُخفي ويُعتم الحروف المشتتة التي لا تنتمي لأي كلمة متبقية',
    hintCost: 2,
    coinCost: 60,
    badge: 'تصفية الشبكة'
  },
  {
    id: 'FULL_WORD',
    name: 'كشف كلمة كاملة',
    description: 'يكشف كلمة كاملة ويحددها تلقائياً على الشبكة مقابل تكلفة أعلى',
    hintCost: 3,
    coinCost: 100,
    badge: 'كلمة كاملة ⚡'
  }
];

export const ACHIEVEMENTS: Achievement[] = [
  // 1. مجموعة الاستكشاف (EXPLORATION: 100, 500, 1000 words)
  {
    id: 'exp_100',
    category: 'EXPLORATION',
    categoryLabel: 'الاستكشاف',
    title: 'مستكشف الحروف الأول',
    description: 'اكتشف 100 كلمة في مختلف المراحل والتصنيفات',
    icon: 'Search',
    target: 100,
    xpReward: 250,
    coinReward: 100,
    titleReward: 'مستكشف الحروف',
    cosmeticReward: 'إطار الذهب الكويتي'
  },
  {
    id: 'exp_500',
    category: 'EXPLORATION',
    categoryLabel: 'الاستكشاف',
    title: 'خبير المعاني والكلمات',
    description: 'اكتشف 500 كلمة بالمجمل',
    icon: 'Compass',
    target: 500,
    xpReward: 600,
    coinReward: 250,
    titleReward: 'صائد الكلمات'
  },
  {
    id: 'exp_1000',
    category: 'EXPLORATION',
    categoryLabel: 'الاستكشاف',
    title: 'موسوعة فتّشها الكبرى',
    description: 'اكتشف 1000 كلمة بالمجمل',
    icon: 'BookOpen',
    target: 1000,
    xpReward: 1200,
    coinReward: 500,
    titleReward: 'أسطورة فتّشها'
  },

  // 2. مجموعة السرعة (SPEED: وقت قياسي)
  {
    id: 'spd_record_45',
    category: 'SPEED',
    categoryLabel: 'السرعة',
    title: 'انطلاقة الصقر',
    description: 'أنهِ مرحلة كاملة خلال وقت قياسي أقل من 45 ثانية',
    icon: 'Zap',
    target: 1,
    xpReward: 200,
    coinReward: 80
  },
  {
    id: 'spd_record_30',
    category: 'SPEED',
    categoryLabel: 'السرعة',
    title: 'عاصفة البرق القياسية',
    description: 'أنهِ مرحلة كاملة في وقت قياسي خارق (أقل من 30 ثانية)',
    icon: 'Zap',
    target: 1,
    xpReward: 450,
    coinReward: 180,
    titleReward: 'ملك السرعة',
    cosmeticReward: 'إطار النيون الزمردي'
  },
  {
    id: 'spd_fast_10',
    category: 'SPEED',
    categoryLabel: 'السرعة',
    title: 'سيد التوقيت القياسي',
    description: 'أنهِ 10 مراحل في أقل من دقيقة واحدة لكل مرحلة',
    icon: 'Clock',
    target: 10,
    xpReward: 700,
    coinReward: 300
  },

  // 3. مجموعة الدقة (ACCURACY: دون أخطاء)
  {
    id: 'acc_perfect_1',
    category: 'ACCURACY',
    categoryLabel: 'الدقة',
    title: 'نظرة صقر لا تخطئ',
    description: 'أنهِ مرحلة كاملة دون أي خطأ (دقة 100%)',
    icon: 'Target',
    target: 1,
    xpReward: 200,
    coinReward: 90
  },
  {
    id: 'acc_perfect_5',
    category: 'ACCURACY',
    categoryLabel: 'الدقة',
    title: 'القناص المحترف',
    description: 'أنهِ 5 مراحل دون أخطاء نهائياً (دقة 100%)',
    icon: 'Award',
    target: 5,
    xpReward: 500,
    coinReward: 220,
    cosmeticReward: 'إطار أبراج الكويت الماسي'
  },
  {
    id: 'acc_perfect_15',
    category: 'ACCURACY',
    categoryLabel: 'الدقة',
    title: 'العلامة الكاملة المطلقة',
    description: 'أنهِ 15 مرحلة دون أخطاء وبثلاث نجوم كاملة',
    icon: 'Star',
    target: 15,
    xpReward: 1000,
    coinReward: 400
  },

  // 4. مجموعة التحدي (CHALLENGE: 10, 50, 100 مباراة)
  {
    id: 'chl_wins_10',
    category: 'CHALLENGE',
    categoryLabel: 'التحدي',
    title: 'بطل الميدان الكويتي',
    description: 'افُز في 10 مباريات وتحديات',
    icon: 'Trophy',
    target: 10,
    xpReward: 400,
    coinReward: 200,
    titleReward: 'بطل الكويت'
  },
  {
    id: 'chl_wins_50',
    category: 'CHALLENGE',
    categoryLabel: 'التحدي',
    title: 'فارس الدواوين الذهبي',
    description: 'افُز في 50 مباراة وتحدي',
    icon: 'Crown',
    target: 50,
    xpReward: 900,
    coinReward: 450,
    cosmeticReward: 'إطار أسطورة فتّشها الناري'
  },
  {
    id: 'chl_wins_100',
    category: 'CHALLENGE',
    categoryLabel: 'التحدي',
    title: 'قاهر المستحيل (100 فوز)',
    description: 'افُز في 100 مباراة وتحدي',
    icon: 'Trophy',
    target: 100,
    xpReward: 1800,
    coinReward: 800,
    titleReward: 'أسطورة فتّشها'
  },

  // 5. مجموعة الاستمرارية (CONSISTENCY: 7, 30, 100 يوم)
  {
    id: 'con_days_7',
    category: 'CONSISTENCY',
    categoryLabel: 'الاستمرارية',
    title: 'التزام الأسبوع الكامل',
    description: 'العب وحافظ على سلسلتك اليومية لمدة 7 أيام',
    icon: 'Flame',
    target: 7,
    xpReward: 300,
    coinReward: 150
  },
  {
    id: 'con_days_30',
    category: 'CONSISTENCY',
    categoryLabel: 'الاستمرارية',
    title: 'شعلة الشهر المتقدة',
    description: 'العب وحافظ على سلسلتك لمدة 30 يوماً',
    icon: 'Flame',
    target: 30,
    xpReward: 850,
    coinReward: 400
  },
  {
    id: 'con_days_100',
    category: 'CONSISTENCY',
    categoryLabel: 'الاستمرارية',
    title: 'وفاء المئة يوم الخالد',
    description: 'العب 100 يوم في فتّشها',
    icon: 'Sparkles',
    target: 100,
    xpReward: 2000,
    coinReward: 1000,
    titleReward: 'أسطورة فتّشها'
  }
];

// Evaluates player progress against all 5 achievement groups and grants XP, Coins, Titles & Cosmetics
export function evaluateAndGrantAchievements(profile: import('../types/game').PlayerProfile): {
  updatedProfile: import('../types/game').PlayerProfile;
  newlyUnlocked: Achievement[];
} {
  const completedEntries = Object.values(profile.completedLevels || {});
  const completedStagesCount = completedEntries.length;
  const totalWords =
    typeof profile.totalWordsFound === 'number' && profile.totalWordsFound > 0
      ? profile.totalWordsFound
      : completedStagesCount * 6;
  const fastUnder45 = completedEntries.filter(e => e.bestTime > 0 && e.bestTime <= 45).length;
  const fastUnder30 = completedEntries.filter(e => e.bestTime > 0 && e.bestTime <= 30).length;
  const fastUnder60 =
    typeof profile.fastStagesCount === 'number'
      ? Math.max(profile.fastStagesCount, completedEntries.filter(e => e.bestTime > 0 && e.bestTime < 60).length)
      : completedEntries.filter(e => e.bestTime > 0 && e.bestTime < 60).length;
  const perfectCount =
    typeof profile.perfectStagesCount === 'number'
      ? Math.max(profile.perfectStagesCount, completedEntries.filter(e => (e.accuracy ?? 100) >= 100).length)
      : completedEntries.filter(e => (e.accuracy ?? 100) >= 100).length;
  const totalWins = completedStagesCount + (profile.multiplayerWins || 0);
  const streakDays = Math.max(
    profile.dailyStreak?.currentStreak || 1,
    profile.dailyStreak?.longestStreak || 1
  );

  const currentAchievements = new Set(profile.achievements || []);
  const currentTitles = new Set(profile.unlockedTitles || ['مستكشف الحروف']);
  const currentCosmetics = new Set(profile.unlockedCosmetics || []);

  let bonusXP = 0;
  let bonusCoins = 0;
  const newlyUnlocked: Achievement[] = [];

  for (const ach of ACHIEVEMENTS) {
    if (currentAchievements.has(ach.id)) continue;

    let progress = 0;
    if (ach.id === 'exp_100' || ach.id === 'exp_500' || ach.id === 'exp_1000') {
      progress = totalWords;
    } else if (ach.id === 'spd_record_45') {
      progress = fastUnder45;
    } else if (ach.id === 'spd_record_30') {
      progress = fastUnder30;
    } else if (ach.id === 'spd_fast_10') {
      progress = fastUnder60;
    } else if (ach.id === 'acc_perfect_1' || ach.id === 'acc_perfect_5' || ach.id === 'acc_perfect_15') {
      progress = perfectCount;
    } else if (ach.id === 'chl_wins_10' || ach.id === 'chl_wins_50' || ach.id === 'chl_wins_100') {
      progress = totalWins;
    } else if (ach.id === 'con_days_7' || ach.id === 'con_days_30' || ach.id === 'con_days_100') {
      progress = streakDays;
    }

    if (progress >= ach.target) {
      currentAchievements.add(ach.id);
      bonusXP += ach.xpReward;
      bonusCoins += ach.coinReward;
      if (ach.titleReward) {
        currentTitles.add(ach.titleReward);
      }
      if (ach.cosmeticReward) {
        currentCosmetics.add(ach.cosmeticReward);
      }
      newlyUnlocked.push(ach);
    }
  }

  const nextXP = (profile.xp || 0) + bonusXP;
  const nextLevel = Math.floor(nextXP / 300) + 1;
  const unlockedTitlesArr = Array.from(currentTitles);

  const updatedProfile: PlayerProfile = {
    ...profile,
    xp: nextXP,
    level: nextLevel,
    coins: (profile.coins || 0) + bonusCoins,
    totalWordsFound: totalWords,
    fastStagesCount: fastUnder60,
    perfectStagesCount: perfectCount,
    completedLevelsCount: completedStagesCount,
    achievements: Array.from(currentAchievements),
    unlockedTitles: unlockedTitlesArr,
    selectedTitle: profile.selectedTitle || unlockedTitlesArr[unlockedTitlesArr.length - 1] || 'مستكشف الحروف',
    unlockedCosmetics: Array.from(currentCosmetics)
  };

  return { updatedProfile, newlyUnlocked };
}

// ============================================================================
// COMPREHENSIVE FATTESHHA STORE & ONLINE BATTLE ACTION CARDS CATALOG
// ============================================================================

export const POWER_UP_ITEMS: PowerUpDefinition[] = [
  {
    id: 'FREEZE_TIME',
    name: 'تجميد الوقت (30 ثانية)',
    description: 'يوقف مؤقت المرحلة لمدة 30 ثانية كاملة لتبحث بهدوء دون ضغط',
    icon: '❄️',
    coinPrice: 80,
    badgeColor: '#38bdf8'
  },
  {
    id: 'DOUBLE_BOOST',
    name: 'مضاعف المكافآت (2x)',
    description: 'يضاعف عملات فتّشها ونقاط الخبرة XP التي تكسبها في الجولة القادمة',
    icon: '⚡',
    coinPrice: 110,
    badgeColor: '#facc15'
  },
  {
    id: 'STREAK_SHIELD',
    name: 'درع السلسلة اليومية',
    description: 'يحمي سلسلة التتابع اليومية من التصفير إذا فاتك يوم لعب واحد',
    icon: '🛡️',
    coinPrice: 140,
    badgeColor: '#10b981'
  },
  {
    id: 'TIME_EXTEND',
    name: 'تذكرة تمديد الوقت (+60ث)',
    description: 'تمنحك دقيقة إضافية مجانية عند انتهاء وقت المرحلة للمواصلة والفوز',
    icon: '⏳',
    coinPrice: 70,
    badgeColor: '#f97316'
  }
];

export const BATTLE_CARD_ITEMS: BattleCardDefinition[] = [
  {
    id: 'CARD_FREEZE_OPPONENT',
    name: 'كرت تجميد الخصم',
    shortName: 'تجميد الخصم',
    description: 'يجمّد لوحة خصمك في التحدي الأونلاين لمدة 15 ثانية ويمنعه من سحب الحروف!',
    icon: '❄️',
    coinPrice: 90,
    kind: 'ATTACK',
    durationSec: 15,
    accentColor: '#38bdf8'
  },
  {
    id: 'CARD_SANDSTORM',
    name: 'كرت عاصفة رملية',
    shortName: 'عاصفة رملية',
    description: 'يرسل عاصفة غبار كويتية تشوش وتضبّب حروف خصمك لمدة 15 ثانية!',
    icon: '🌫️',
    coinPrice: 85,
    kind: 'ATTACK',
    durationSec: 15,
    accentColor: '#f59e0b'
  },
  {
    id: 'CARD_BLIND_WORDS',
    name: 'كرت إخفاء الكلمات',
    shortName: 'تعمية الكلمات',
    description: 'يُخفي قائمة الكلمات المطلوبة عن شاشة الخصم لمدة 15 ثانية!',
    icon: '🙈',
    coinPrice: 95,
    kind: 'ATTACK',
    durationSec: 15,
    accentColor: '#a855f7'
  },
  {
    id: 'CARD_STEAL_POINTS',
    name: 'كرت سرقة النقاط',
    shortName: 'سرقة 100 نقطة',
    description: 'يسحب 100 نقطة فوراً من رصيد خصمك في المباراة ويضيفها إلى رصيدك!',
    icon: '⚡',
    coinPrice: 120,
    kind: 'ATTACK',
    accentColor: '#ef4444'
  },
  {
    id: 'CARD_SHIELD',
    name: 'كرت درع الحماية',
    shortName: 'درع صد الهجوم',
    description: 'يحمي لوحتك ونقاطك ويصدّ تلقائياً كرت الهجوم القادم من خصمك!',
    icon: '🛡️',
    coinPrice: 75,
    kind: 'DEFENSE',
    accentColor: '#10b981'
  }
];

export const BOARD_THEME_ITEMS: BoardThemeDefinition[] = [
  {
    id: 'theme_kuwait_neon',
    name: 'نيون الكويت الأصلي',
    description: 'تصميم طاولة الكويت النيون الأزرق السماوي الافتراضي',
    coinPrice: 0,
    boardBackground: 'linear-gradient(180deg, rgba(8, 30, 48, 0.94) 0%, rgba(4, 15, 26, 0.97) 100%)',
    boardBorder: '2px solid rgba(56, 189, 248, 0.65)',
    boardShadow: '0 0 36px rgba(14, 165, 233, 0.28), inset 0 0 24px rgba(14, 165, 233, 0.14)',
    cellBackground: 'linear-gradient(180deg, #163a59 0%, #0b2136 100%)',
    cellBorder: '1.5px solid rgba(125, 211, 252, 0.42)',
    previewGradient: 'linear-gradient(135deg, #0ea5e9 0%, #082f49 100%)'
  },
  {
    id: 'theme_mubarakiyah',
    name: 'ليالي المباركية التراثية',
    description: 'إضاءة فوانيس دافئة بألوان العنبر والخشب المعتق',
    coinPrice: 220,
    boardBackground: 'linear-gradient(180deg, rgba(58, 32, 12, 0.95) 0%, rgba(28, 14, 5, 0.98) 100%)',
    boardBorder: '2px solid rgba(251, 191, 36, 0.72)',
    boardShadow: '0 0 36px rgba(245, 158, 11, 0.28), inset 0 0 24px rgba(251, 191, 36, 0.14)',
    cellBackground: 'linear-gradient(180deg, #5c3416 0%, #321b0a 100%)',
    cellBorder: '1.5px solid rgba(252, 211, 77, 0.45)',
    previewGradient: 'linear-gradient(135deg, #f59e0b 0%, #451a03 100%)'
  },
  {
    id: 'theme_sadu',
    name: 'نسيج السدو الكويتي',
    description: 'طاولة مستوحاة من ألوان السدو الكويتي الأحمر القرمزي والرمال',
    coinPrice: 280,
    boardBackground: 'linear-gradient(180deg, rgba(64, 14, 24, 0.95) 0%, rgba(28, 6, 12, 0.98) 100%)',
    boardBorder: '2px solid rgba(244, 63, 94, 0.7)',
    boardShadow: '0 0 36px rgba(225, 29, 72, 0.28), inset 0 0 24px rgba(251, 113, 133, 0.14)',
    cellBackground: 'linear-gradient(180deg, #621728 0%, #360b16 100%)',
    cellBorder: '1.5px solid rgba(253, 164, 175, 0.45)',
    previewGradient: 'linear-gradient(135deg, #e11d48 0%, #4c0519 100%)'
  },
  {
    id: 'theme_royal_gold',
    name: 'الطاولة الذهبية الملكية',
    description: 'طاولة نخبة أبطال فتّشها بإطار ذهبي مشع ولمسة زمردية',
    coinPrice: 360,
    boardBackground: 'linear-gradient(180deg, rgba(20, 38, 28, 0.96) 0%, rgba(7, 17, 13, 0.98) 100%)',
    boardBorder: '2px solid rgba(250, 204, 21, 0.85)',
    boardShadow: '0 0 42px rgba(250, 204, 21, 0.32), inset 0 0 26px rgba(16, 185, 129, 0.16)',
    cellBackground: 'linear-gradient(180deg, #1b4332 0%, #0d261c 100%)',
    cellBorder: '1.5px solid rgba(250, 204, 21, 0.5)',
    previewGradient: 'linear-gradient(135deg, #facc15 0%, #065f46 100%)'
  }
];

export const TRAIL_STYLE_ITEMS: TrailStyleDefinition[] = [
  {
    id: 'trail_amber',
    name: 'توهج العنبر الافتراضي',
    description: 'تأثير تحديد ذهبي دافئ عند سحب الكلمات',
    coinPrice: 0,
    selectedBackground: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
    selectedBorder: '1.5px solid #fef08a',
    selectedShadow: '0 0 16px rgba(245, 158, 11, 0.6), inset 0 1px 1px rgba(255,255,255,0.5)',
    selectedTextClass: 'text-slate-950',
    previewGradient: 'linear-gradient(90deg, #fbbf24, #f59e0b)'
  },
  {
    id: 'trail_laser',
    name: 'شعاع الليزر السماوي',
    description: 'مسار ليزر أزرق نيون متوهج فائق السطوع',
    coinPrice: 160,
    selectedBackground: 'linear-gradient(180deg, #67e8f9 0%, #06b6d4 100%)',
    selectedBorder: '1.5px solid #ffffff',
    selectedShadow: '0 0 20px rgba(34, 211, 238, 0.85), inset 0 1px 1px rgba(255,255,255,0.6)',
    selectedTextClass: 'text-slate-950',
    previewGradient: 'linear-gradient(90deg, #67e8f9, #0284c7)'
  },
  {
    id: 'trail_kuwait',
    name: 'ألوان علم الكويت',
    description: 'تحديد متدرج بألوان الفخر الكويتي الأخضر والأحمر المضيء',
    coinPrice: 240,
    selectedBackground: 'linear-gradient(135deg, #22c55e 0%, #f8fafc 50%, #ef4444 100%)',
    selectedBorder: '1.5px solid #ffffff',
    selectedShadow: '0 0 18px rgba(34, 197, 94, 0.65)',
    selectedTextClass: 'text-slate-950',
    previewGradient: 'linear-gradient(90deg, #16a34a, #ffffff, #dc2626)'
  },
  {
    id: 'trail_gold',
    name: 'شرار الذهب الأرجواني',
    description: 'تأثير تحديد ملكي بنفسجي وذهبي مبهر',
    coinPrice: 290,
    selectedBackground: 'linear-gradient(135deg, #fde047 0%, #ec4899 100%)',
    selectedBorder: '1.5px solid #fef9c3',
    selectedShadow: '0 0 22px rgba(236, 72, 153, 0.75)',
    selectedTextClass: 'text-white',
    previewGradient: 'linear-gradient(90deg, #fde047, #ec4899)'
  }
];

export const EXCLUSIVE_AVATARS: ExclusiveAvatarItem[] = [
  {
    id: 'avatar_kuwait_hero',
    name: 'شخصية النوخذة البطل',
    description: 'الصورة الرمزية الملكية الرسمية لبطل فتّشها الكويتي',
    url: '/assets/images/login_kuwaiti_mascot_1794483388654.jpg',
    coinPrice: 180,
    badge: 'حصري ⚓'
  },
  {
    id: 'avatar_trophy_champion',
    name: 'حامل كأس الكويت',
    description: 'شعار كأس البطولة الذهبي الفاخر لأبطال التحديات',
    url: '/assets/images/game_trophy_kuwait_1794404783493.jpg',
    coinPrice: 260,
    badge: 'أسطوري 🏆'
  },
  {
    id: 'avatar_towers_night',
    name: 'حارس أبراج الكويت',
    description: 'خلفية وأيقونة أبراج الكويت المضيئة ليلاً',
    url: '/assets/images/hero_fatteshha_cover_1794404782445.jpg',
    coinPrice: 320,
    badge: 'مميز 🇰🇼'
  }
];

export const NAME_GLOW_ITEMS: NameGlowItem[] = [
  {
    id: 'glow_none',
    name: 'الخط السماوي القياسي',
    description: 'عرض الاسم باللون السماوي الكلاسيكي الواضح',
    coinPrice: 0,
    previewClass: 'text-sky-300'
  },
  {
    id: 'glow_gold',
    name: 'توهج الذهب الملكي',
    description: 'يظهر اسمك ببريق ذهبي مشع في الرئيسية والتحدي',
    coinPrice: 180,
    previewClass: 'text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.9)]'
  },
  {
    id: 'glow_emerald',
    name: 'توهج النيون الأخضر',
    description: 'إضاءة نيون خضراء ساطعة حول اسم اللاعب',
    coinPrice: 210,
    previewClass: 'text-lime-300 drop-shadow-[0_0_10px_rgba(163,230,53,0.9)]'
  },
  {
    id: 'glow_rainbow',
    name: 'بريق أسطورة فتّشها',
    description: 'تدرج نيون متلألئ يجمع السماوي والذهبي والوردي',
    coinPrice: 340,
    previewClass: 'bg-gradient-to-l from-amber-300 via-pink-400 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(236,72,153,0.75)]'
  }
];

export const EMOTE_PACK_ITEMS: EmotePackDefinition[] = [
  {
    id: 'emotes_diwaniya',
    name: 'حزمة تعبيرات الديوانية',
    description: 'تفاعلات كويتية حماسية داخل مباريات الأونلاين',
    coinPrice: 150,
    emotes: ['على راسي! 🫡', 'ما لك أمل 😂', 'عاش الذيب! 🐺', 'يا ساتر! 🔥']
  },
  {
    id: 'emotes_champions',
    name: 'حزمة تعبيرات الأبطال',
    description: 'عبارات تفاخر وتحدي فورية ضد خصومك أونلاين',
    coinPrice: 200,
    emotes: ['صادوها! 🎯', 'سرعة البرق ⚡', 'غلبناك 😎', 'مباراة نارية! 🏆']
  }
];

export const PREMIUM_PACK_ITEMS: PremiumPackDefinition[] = [
  {
    id: 'pack_kuwait_dialect_pro',
    categoryId: 'kuwait_dialect_pro',
    name: 'تحدي اللهجة الكويتية العميق (50 مرحلة)',
    description: 'مفردات تراثية أصيلة وتحديات متدرجة لأهل الديرة',
    coinPrice: 280,
    icon: '🏜️',
    accentColor: '#f59e0b'
  },
  {
    id: 'pack_gulf_theater_classics',
    categoryId: 'gulf_theater_classics',
    name: 'كلاسيكيات المسرح الكويتي (50 مرحلة)',
    description: 'أشهر عبارات وشخصيات المسرح الكويتي والخليجي الخالدة',
    coinPrice: 280,
    icon: '🎭',
    accentColor: '#ec4899'
  }
];

export const SEASON_PASS_TIERS: SeasonPassTier[] = [
  {
    tier: 1,
    requiredSeasonXp: 100,
    freeRewardLabel: '+80 عملة فتّشها',
    vipRewardLabel: '+200 عملة + كرت تجميد الخصم ❄️',
    freeCoins: 80,
    vipCoins: 200,
    vipBattleCard: 'CARD_FREEZE_OPPONENT'
  },
  {
    tier: 2,
    requiredSeasonXp: 250,
    freeRewardLabel: '+3 تلميحات ذكية',
    vipRewardLabel: '+250 عملة + مضاعف 2x ⚡',
    freeHints: 3,
    vipCoins: 250,
    vipPowerUp: 'DOUBLE_BOOST'
  },
  {
    tier: 3,
    requiredSeasonXp: 450,
    freeRewardLabel: '+150 عملة فتّشها',
    vipRewardLabel: '+350 عملة + كرت سرقة نقاط ⚡',
    freeCoins: 150,
    vipCoins: 350,
    vipBattleCard: 'CARD_STEAL_POINTS'
  },
  {
    tier: 4,
    requiredSeasonXp: 700,
    freeRewardLabel: '+5 تلميحات ذكية',
    vipRewardLabel: '+500 عملة + درع الحماية 🛡️',
    freeHints: 5,
    vipCoins: 500,
    vipBattleCard: 'CARD_SHIELD'
  }
];

export const STARTER_PACK_DEF = {
  id: 'starter_pack_q8',
  name: 'حزمة البداية السريعة (عرض لمرة واحدة)',
  description: 'باقة شاملة بسعر مخفض: +400 عملة فتّشها، +6 تلميحات، تجميد وقت + مضاعف 2x، وكرتي هجوم أونلاين!',
  coinPrice: 120,
  rewardsCoins: 400,
  rewardsHints: 6,
  rewardsPowerUps: { FREEZE_TIME: 2, DOUBLE_BOOST: 2 },
  rewardsBattleCards: { CARD_FREEZE_OPPONENT: 2, CARD_SHIELD: 2 }
};

export const VIP_PASS_PRICE = 450;
export const MYSTERY_BOX_PRICE = 95;

export function getBoardThemeById(id?: string): BoardThemeDefinition {
  return BOARD_THEME_ITEMS.find(t => t.id === id) || BOARD_THEME_ITEMS[0];
}

export function getTrailStyleById(id?: string): TrailStyleDefinition {
  return TRAIL_STYLE_ITEMS.find(t => t.id === id) || TRAIL_STYLE_ITEMS[0];
}

export function getNameGlowClass(id?: string): string {
  return NAME_GLOW_ITEMS.find(g => g.id === id)?.previewClass || 'text-sky-300';
}

export function rollMysteryBoxReward(): MysteryBoxReward {
  const pool: MysteryBoxReward[] = [
    { kind: 'COINS', amount: 150, label: '150 عملة فتّشها 🪙', rarity: 'شائع' },
    { kind: 'COINS', amount: 300, label: '300 عملة فتّشها ذهبية 🪙', rarity: 'أسطوري 👑' },
    { kind: 'HINTS', amount: 4, label: '4 تلميحات ذكية 💡', rarity: 'شائع' },
    { kind: 'BATTLE_CARD', id: 'CARD_FREEZE_OPPONENT', amount: 2, label: '2× كرت تجميد الخصم أونلاين ❄️', rarity: 'نادر' },
    { kind: 'BATTLE_CARD', id: 'CARD_STEAL_POINTS', amount: 2, label: '2× كرت سرقة 100 نقطة ⚡', rarity: 'نادر' },
    { kind: 'BATTLE_CARD', id: 'CARD_SANDSTORM', amount: 2, label: '2× كرت العاصفة الرملية 🌫️', rarity: 'نادر' },
    { kind: 'POWER_UP', id: 'DOUBLE_BOOST', amount: 2, label: '2× مضاعف العملات والخبرة (2x) ⚡', rarity: 'نادر' },
    { kind: 'POWER_UP', id: 'FREEZE_TIME', amount: 2, label: '2× معزز تجميد الوقت ❄️', rarity: 'نادر' },
    { kind: 'BOARD_THEME', id: 'theme_mubarakiyah', amount: 1, label: 'طاولة ليالي المباركية التراثية ✨', rarity: 'أسطوري 👑' }
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}
