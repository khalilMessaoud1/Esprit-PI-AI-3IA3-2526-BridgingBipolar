import { Language } from "./i18n";

export type AssessmentOption = {
  value: number;
  label: Record<Language, string>;
};

export type AssessmentQuestion = {
  id: string;
  text: Record<Language, string>;
  options: AssessmentOption[];
};

export type AssessmentType = "YMRS" | "HDRS";

export const ymrsQuestions: AssessmentQuestion[] = [
  {
    id: "ymrs-1",
    text: {
      en: "Euphoric mood",
      fr: "Humeur euphorique",
      ar: "مزاج مبتهج"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absente", ar: "غائبة" } },
      { value: 1, label: { en: "Slightly or maybe increased on interview", fr: "Légèrement ou peut-être accrue à l'interrogatoire", ar: "زيادة طفيفة أو محتملة أثناء المقابلة" } },
      { value: 2, label: { en: "Clearly elevated; optimistic and confident", fr: "Nette exaltation subjective; optimiste, assuré, de bonne humeur; humeur appropriée au contenu", ar: "ارتفاع واضح؛ متفائل وواثق" } },
      { value: 3, label: { en: "Elevated and inappropriate to content; cheerful", fr: "Humeur exaltée, non appropriée au contenu; humeur joyeuse", ar: "مزاج مرتفع غير مناسب للمحتوى؛ مرح" } },
      { value: 4, label: { en: "Euphoric; inappropriate laughter or singing", fr: "Euphorique; rire inapproprié, chante", ar: "نشوة؛ ضحك غير مناسب، يغني" } }
    ]
  },
  {
    id: "ymrs-2",
    text: {
      en: "Increased motor activity",
      fr: "Accroissement de l'activité motrice",
      ar: "زيادة النشاط الحركي"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absent", ar: "غير موجود" } },
      { value: 1, label: { en: "Subjective increase", fr: "Augmentation subjective", ar: "زيادة ذاتية" } },
      { value: 2, label: { en: "Animated; increased gestures", fr: "Animé; augmentation des gestes", ar: "منشط؛ زيادة في الإيماءات" } },
      { value: 3, label: { en: "Excess energy; sometimes hyperactive; agitated", fr: "Énergie excessive; parfois hyperactif; agité (peut être calmé)", ar: "طاقة مفرطة؛ أحيانًا مفرط النشاط؛ مضطرب" } },
      { value: 4, label: { en: "Motor excitement; permanent hyperactivity", fr: "Excitation motrice; hyperactivité permanente (ne peut être calmé)", ar: "استثارة حركية؛ فرط نشاط دائم" } }
    ]
  },
  {
    id: "ymrs-3",
    text: {
      en: "Interest in sexuality",
      fr: "Intérêt pour la sexualité",
      ar: "الاهتمام بالجنس"
    },
    options: [
      { value: 0, label: { en: "Normal; not increased", fr: "Normal; non augmenté", ar: "طبيعي؛ غير زائد" } },
      { value: 1, label: { en: "Slightly or maybe increased", fr: "Légèrement ou peut-être augmenté", ar: "زيادة طفيفة أو محتملة" } },
      { value: 2, label: { en: "Clearly increased on interview", fr: "Nette augmentation subjective à l'interrogatoire", ar: "زيادة واضحة أثناء المقابلة" } },
      { value: 3, label: { en: "Spontaneous sexual content; hypersexual", fr: "Contenu sexuel spontané; élabore sur des sujets sexuels; se déclare hypersexualisé", ar: "محتوى جنسي عفوي؛ فرط رغبة جنسية" } },
      { value: 4, label: { en: "Explicit sexual gestures", fr: "Gestes sexuels explicites (envers des patients, le personnel, l'évaluateur)", ar: "إيماءات جنسية صريحة" } }
    ]
  },
  {
    id: "ymrs-4",
    text: {
      en: "Sleep",
      fr: "Sommeil",
      ar: "النوم"
    },
    options: [
      { value: 0, label: { en: "No decrease in sleep", fr: "Ne signale aucune diminution du sommeil", ar: "لا يذكر أي نقص في النوم" } },
      { value: 1, label: { en: "Sleeps up to one hour less than normal", fr: "Dort jusqu'à une heure de moins que la normale", ar: "ينام أقل من ساعة مقارنة بالطبيعي" } },
      { value: 2, label: { en: "Sleeps more than one hour less than normal", fr: "Dort plus d'une heure de moins que la normale", ar: "ينام أكثر من ساعة أقل من الطبيعي" } },
      { value: 3, label: { en: "Reports a reduced need for sleep", fr: "Signale un besoin réduit de sommeil", ar: "يذكر حاجة أقل للنوم" } },
      { value: 4, label: { en: "Denies needing sleep", fr: "Nie avoir besoin de sommeil", ar: "ينكر الحاجة إلى النوم" } }
    ]
  },
  {
    id: "ymrs-5",
    text: {
      en: "Irritability",
      fr: "Irritabilité",
      ar: "التهيج"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absente", ar: "غير موجودة" } },
      { value: 2, label: { en: "Subjectively increased", fr: "Subjectivement augmentée", ar: "زيادة ذاتية" } },
      { value: 4, label: { en: "Sometimes irritable during interview; recent episodes of anger or annoyance", fr: "Parfois irritable pendant l'entrevue; épisodes récents de colère ou de nuisance dans le service", ar: "أحيانًا سريع التهيج أثناء المقابلة" } },
      { value: 6, label: { en: "Frequently irritable during interview; abrupt and cutting throughout", fr: "Fréquemment irritable pendant l'entrevue; brusque, cassant pendant toute l'entrevue", ar: "سريع التهيج بشكل متكرر أثناء المقابلة" } },
      { value: 8, label: { en: "Hostile, uncooperative; interview impossible", fr: "Hostile, non coopératif; entrevue impossible", ar: "عدائي، غير متعاون؛ المقابلة مستحيلة" } }
    ]
  },
  {
    id: "ymrs-6",
    text: {
      en: "Speech (rate and amount)",
      fr: "Discours (débit et quantité)",
      ar: "الكلام (السرعة والكمية)"
    },
    options: [
      { value: 0, label: { en: "No increase", fr: "Aucune augmentation", ar: "لا زيادة" } },
      { value: 2, label: { en: "Talkative", fr: "D'humeur bavarde", ar: "كثير الكلام" } },
      { value: 4, label: { en: "Occasional increase in rate or amount; sometimes verbose", fr: "Hausse occasionnelle du débit ou de la quantité, parfois verbeux", ar: "زيادة عرضية في السرعة أو الكمية" } },
      { value: 6, label: { en: "Pressured; rate and amount systematically increased; difficult to interrupt", fr: "Poussé; débit et quantité systématiquement accrus; difficile à interrompre", ar: "مندفع؛ يصعب مقاطعته" } },
      { value: 8, label: { en: "Rushed; impossible to interrupt; uninterrupted speech", fr: "Pressé; impossible à interrompre, discours ininterrompu", ar: "لا يمكن مقاطعته؛ كلام متواصل" } }
    ]
  },
  {
    id: "ymrs-7",
    text: {
      en: "Language or thought disorder",
      fr: "Trouble du langage ou de la pensée",
      ar: "اضطراب اللغة أو الفكر"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absent", ar: "غير موجود" } },
      { value: 1, label: { en: "Loose associations; mild distractibility; alertness", fr: "Pensées diffuses; légère distractibilité; vivacité d'esprit", ar: "تشتت خفيف؛ يقظة ذهنية" } },
      { value: 2, label: { en: "Easily distracted; loses the thread; changes topics often", fr: "Facilement distrait; perd le fil de ses idées; change souvent de sujet", ar: "سهل التشتت؛ يغير المواضيع كثيرًا" } },
      { value: 3, label: { en: "Flight of ideas; tangential thought; hard to follow", fr: "Fuite des idées; pensée tangentielle; difficile à suivre; rimes, écholalie", ar: "تطاير الأفكار؛ تفكير متشعب" } },
      { value: 4, label: { en: "Incoherent; communication impossible", fr: "Incohérent, communication impossible", ar: "غير مترابط؛ التواصل مستحيل" } }
    ]
  },
  {
    id: "ymrs-8",
    text: {
      en: "Content",
      fr: "Contenu",
      ar: "المحتوى"
    },
    options: [
      { value: 0, label: { en: "Normal", fr: "Normal", ar: "طبيعي" } },
      { value: 2, label: { en: "Questionable plans, new interests", fr: "Plans discutables, nouveaux intérêts", ar: "خطط مشكوك فيها؛ اهتمامات جديدة" } },
      { value: 4, label: { en: "Special projects; excessively religious", fr: "Projets spéciaux; excessivement religieux", ar: "مشاريع خاصة؛ تدين مفرط" } },
      { value: 6, label: { en: "Grandiose or paranoid ideas; persecutory ideas", fr: "Idées de grandeur ou paranoïa; idées de persécution", ar: "أفكار عظمة أو بارانويا؛ أفكار اضطهاد" } },
      { value: 8, label: { en: "Delusion; hallucinations", fr: "Délire; hallucinations", ar: "ضلالات؛ هلوسات" } }
    ]
  },
  {
    id: "ymrs-9",
    text: {
      en: "Disruptive or aggressive behavior",
      fr: "Comportement perturbateur ou agressif",
      ar: "سلوك مزعج أو عدواني"
    },
    options: [
      { value: 0, label: { en: "Absent; cooperative", fr: "Absent; coopère", ar: "غير موجود؛ متعاون" } },
      { value: 2, label: { en: "Sarcastic; sometimes virulent; reserved", fr: "Sarcastique; parfois virulent, réservé", ar: "ساخر؛ أحيانًا لاذع" } },
      { value: 4, label: { en: "Demanding; makes threats in the service", fr: "Exigeant; fait des menaces dans le service", ar: "متطلب؛ يهدد داخل القسم" } },
      { value: 6, label: { en: "Threatens examiner; shouts; interview difficult", fr: "Menace l'évaluateur; crie; entrevue difficile", ar: "يهدد المقيم؛ يصرخ" } },
      { value: 8, label: { en: "Violent, destructive; interview impossible", fr: "Violent, destructeur; entrevue impossible", ar: "عنيف، تدميري؛ المقابلة مستحيلة" } }
    ]
  },
  {
    id: "ymrs-10",
    text: {
      en: "Appearance",
      fr: "Apparence",
      ar: "المظهر"
    },
    options: [
      { value: 0, label: { en: "Appropriate dress and appearance", fr: "Tenue et apparence appropriées", ar: "مظهر ولباس مناسبان" } },
      { value: 1, label: { en: "Slightly disheveled", fr: "Légèrement débraillé", ar: "غير مرتب قليلًا" } },
      { value: 2, label: { en: "Poor grooming; moderately disheveled; overdressed", fr: "Toilette laissant à désirer; modérément débraillé; tenue trop recherchée", ar: "عناية شخصية سيئة؛ غير مرتب بشكل متوسط" } },
      { value: 3, label: { en: "Disheveled; partly dressed; flashy makeup", fr: "Débraillé; partiellement habillé; maquillage voyant", ar: "غير مرتب؛ نصف مرتدٍ؛ مكياج لافت" } },
      { value: 4, label: { en: "Completely disheveled; bizarre attire", fr: "Tenue tout à fait débraillée; accoutrement bizarre", ar: "مظهر فوضوي جدًا؛ لباس غريب" } }
    ]
  },
  {
    id: "ymrs-11",
    text: {
      en: "Insight",
      fr: "Lucidité",
      ar: "الاستبصار"
    },
    options: [
      { value: 0, label: { en: "Present; recognizes illness and need for treatment", fr: "Présente; reconnaît sa maladie; reconnaît la nécessité d'un traitement", ar: "يعترف بالمرض والحاجة للعلاج" } },
      { value: 1, label: { en: "May be ill", fr: "Reconnaît qu'il peut être malade", ar: "يعترف بأنه قد يكون مريضًا" } },
      { value: 2, label: { en: "Recognizes behavior change, but denies illness", fr: "Reconnaît le changement de comportement, mais nie la maladie", ar: "يعترف بتغير السلوك لكنه ينكر المرض" } },
      { value: 3, label: { en: "Possible behavior change, but denies illness", fr: "Reconnaît qu'il y a peut-être un changement de comportement, mais nie la maladie", ar: "يعترف بإمكانية وجود تغير سلوكي لكنه ينكر المرض" } },
      { value: 4, label: { en: "Denies any behavior change", fr: "Nie tout changement de comportement", ar: "ينكر أي تغير في السلوك" } }
    ]
  }
];

export const hdrsQuestions: AssessmentQuestion[] = [
  {
    id: "hdrs-1",
    text: {
      en: "Depressed mood",
      fr: "Humeur dépressive (tristesse, sentiment d'être sans espoir, impuissant, auto-dépréciation)",
      ar: "مزاج اكتئابي"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absent", ar: "غير موجود" } },
      { value: 1, label: { en: "Only if asked", fr: "Ces états affectifs ne sont signalés que si l'on interroge le sujet", ar: "لا يذكرها إلا عند الاستجواب" } },
      { value: 2, label: { en: "Spontaneously reported", fr: "Ces états affectifs sont signalés verbalement spontanément", ar: "يصرح بها تلقائيا" } },
      { value: 3, label: { en: "Communicated non-verbally", fr: "Le sujet communique ces états affectifs non verbalement (expression facile, attitude, voix, pleurs)", ar: "يعبر عنها غير لفظيا" } },
      { value: 4, label: { en: "Mostly communicates affect spontaneously", fr: "Le sujet ne communique pratiquement que ses états affectifs dans ses communications spontanées verbales et non verbales", ar: "يعبر عنها تقريبا فقط في التواصل التلقائي" } }
    ]
  },
  {
    id: "hdrs-2",
    text: {
      en: "Feelings of guilt",
      fr: "Sentiments de culpabilité",
      ar: "مشاعر الذنب"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absent", ar: "غير موجود" } },
      { value: 1, label: { en: "Self-reproach; feels he caused harm", fr: "S'adresse des reproches à lui-même, a l'impression qu'il a causé un préjudice à des gens", ar: "يلوم نفسه" } },
      { value: 2, label: { en: "Guilt ideas or rumination", fr: "Idées de culpabilité ou ruminations sur des erreurs passées ou des actions condamnables", ar: "أفكار ذنب أو اجترار" } },
      { value: 3, label: { en: "Current illness is punishment; delusional guilt", fr: "La maladie actuelle est une punition. Idées délirantes de culpabilité", ar: "المرض الحالي عقوبة؛ أوهام ذنب" } },
      { value: 4, label: { en: "Accusing voices and/or threatening visual hallucinations", fr: "Entend des voix qui l'accusent ou le dénoncent et/ou a des hallucinations visuelles menaçantes", ar: "أصوات تتهمه و/أو هلوسات بصرية تهديدية" } }
    ]
  },
  {
    id: "hdrs-3",
    text: {
      en: "Suicide",
      fr: "Suicide",
      ar: "انتحار"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absent", ar: "غير موجود" } },
      { value: 1, label: { en: "Life not worth living", fr: "A l'impression que la vie ne vaut pas la peine d'être vécue", ar: "يشعر أن الحياة لا تستحق أن تعاش" } },
      { value: 2, label: { en: "Wishes to be dead", fr: "Souhaite être mort ou équivalent : toute pensée de mort possible dirigée contre lui-même", ar: "يتمنى الموت أو ما يعادله" } },
      { value: 3, label: { en: "Suicidal ideas or gestures", fr: "Idées ou gestes de suicide", ar: "أفكار أو أفعال انتحارية" } },
      { value: 4, label: { en: "Suicide attempts", fr: "Tentatives de suicide", ar: "محاولات انتحار" } }
    ]
  },
  {
    id: "hdrs-4",
    text: {
      en: "Early insomnia",
      fr: "Insomnie du début de nuit",
      ar: "أرق بداية الليل"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absent", ar: "غير موجود" } },
      { value: 1, label: { en: "Occasional difficulty falling asleep", fr: "Se plaint de difficultés éventuelles à s'endormir", ar: "يشكو من صعوبة أحيانا في النوم" } },
      { value: 2, label: { en: "Difficulty falling asleep every night", fr: "Se plaint d'avoir chaque soir des difficultés à s'endormir", ar: "يشكو من صعوبة في النوم كل ليلة" } }
    ]
  },
  {
    id: "hdrs-5",
    text: {
      en: "Middle insomnia",
      fr: "Insomnie du milieu de nuit",
      ar: "أرق منتصف الليل"
    },
    options: [
      { value: 0, label: { en: "No difficulty", fr: "Pas de difficulté", ar: "لا صعوبة" } },
      { value: 1, label: { en: "Agitated or disturbed during the night", fr: "Le malade se plaint d'être agité ou troublé pendant la nuit", ar: "يشكو من اضطراب أثناء الليل" } },
      { value: 2, label: { en: "Wakes during the night", fr: "Il se réveille pendant la nuit", ar: "يستيقظ أثناء الليل" } }
    ]
  },
  {
    id: "hdrs-6",
    text: {
      en: "Late insomnia",
      fr: "Insomnie du matin",
      ar: "أرق الصباح"
    },
    options: [
      { value: 0, label: { en: "No difficulty", fr: "Pas de difficulté", ar: "لا صعوبة" } },
      { value: 1, label: { en: "Wakes very early but goes back to sleep", fr: "Se réveille de très bonne heure le matin mais se rendort", ar: "يستيقظ باكرا جدا ثم ينام مجددا" } },
      { value: 2, label: { en: "Unable to sleep again if he gets up", fr: "Incapable de se rendormir s'il se lève", ar: "غير قادر على العودة للنوم إذا نهض" } }
    ]
  },
  {
    id: "hdrs-7",
    text: {
      en: "Work and activities",
      fr: "Travail et activités",
      ar: "العمل والأنشطة"
    },
    options: [
      { value: 0, label: { en: "No difficulty", fr: "Pas de difficulté", ar: "لا صعوبة" } },
      { value: 1, label: { en: "Feelings of incapacity or fatigue related to work or leisure", fr: "Pensées et sentiments d'incapacité, fatigue ou faiblesse se rapportant à des activités professionnelles ou de détente", ar: "أفكار ومشاعر بالعجز أو التعب" } },
      { value: 2, label: { en: "Loss of interest in work or leisure", fr: "Perte d'intérêt pour les activités professionnelles ou de détente", ar: "فقدان الاهتمام بالعمل أو الترفيه" } },
      { value: 3, label: { en: "Reduced activity time or productivity", fr: "Diminution du temps d'activité ou diminution de la productivité", ar: "انخفاض زمن النشاط أو الإنتاجية" } },
      { value: 4, label: { en: "Stopped working because of current illness", fr: "A arrêté son travail en raison de sa maladie actuelle", ar: "توقف عن العمل بسبب المرض الحالي" } }
    ]
  },
  {
    id: "hdrs-8",
    text: {
      en: "Retardation",
      fr: "Ralentissement (lenteur de la pensée et du langage, baisse de la faculté de concentration, baisse de l'activité motrice)",
      ar: "تباطؤ نفسي حركي"
    },
    options: [
      { value: 0, label: { en: "Normal speech and thoughts", fr: "Langage et pensées normaux", ar: "كلام وأفكار طبيعية" } },
      { value: 1, label: { en: "Slight slowing in interview", fr: "Léger ralentissement à l'entretien", ar: "تباطؤ خفيف أثناء المقابلة" } },
      { value: 2, label: { en: "Clear slowing in interview", fr: "Ralentissement manifeste à l'entretien", ar: "تباطؤ واضح أثناء المقابلة" } },
      { value: 3, label: { en: "Interview difficult", fr: "Entretien difficile", ar: "مقابلة صعبة" } },
      { value: 4, label: { en: "Stupor", fr: "Stupeur", ar: "ذهول" } }
    ]
  },
  {
    id: "hdrs-9",
    text: {
      en: "Agitation",
      fr: "Agitation",
      ar: "هياج"
    },
    options: [
      { value: 0, label: { en: "None", fr: "Aucune", ar: "لا يوجد" } },
      { value: 1, label: { en: "Muscular tension or twitches", fr: "Crispations, secousses musculaires", ar: "توتر أو ارتعاشات عضلية" } },
      { value: 2, label: { en: "Plays with hands or hair", fr: "Joue avec ses mains, ses cheveux, etc.", ar: "يلعب بيديه أو شعره" } },
      { value: 3, label: { en: "Moves around; cannot sit still", fr: "Bouge, ne peut rester assis tranquille", ar: "يتحرك ولا يستطيع الجلوس بهدوء" } },
      { value: 4, label: { en: "Wrings hands, bites nails, pulls hair, bites lips", fr: "Se tord les mains, ronge ses ongles, arrache ses cheveux, se mord les lèvres", ar: "يلوي يديه، يقضم أظافره، يشد شعره، يعض شفتيه" } }
    ]
  },
  {
    id: "hdrs-10",
    text: {
      en: "Psychic anxiety",
      fr: "Anxiété psychique",
      ar: "قلق نفسي"
    },
    options: [
      { value: 0, label: { en: "No disorder", fr: "Aucun trouble", ar: "لا اضطراب" } },
      { value: 1, label: { en: "Subjective tension and irritability", fr: "Tension subjective et irritabilité", ar: "توتر ذاتي وتهيّج" } },
      { value: 2, label: { en: "Worries about minor problems", fr: "Se fait du souci à propos de problèmes mineurs", ar: "يقلق بشأن مشاكل بسيطة" } },
      { value: 3, label: { en: "Apprehensive attitude visible in face and speech", fr: "Attitude inquiète, apparente dans l'expression faciale et le langage", ar: "قلق ظاهر في الوجه والكلام" } },
      { value: 4, label: { en: "Fears expressed without questioning", fr: "Peurs exprimées sans que l'on pose de questions", ar: "مخاوف معبر عنها دون سؤال" } }
    ]
  },
  {
    id: "hdrs-11",
    text: {
      en: "Somatic anxiety",
      fr: "Anxiété somatique (bouche sèche, troubles digestifs, palpitations, céphalées, pollakiurie, hyperventilation, transpiration, soupirs)",
      ar: "قلق جسدي"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absente", ar: "غائبة" } },
      { value: 1, label: { en: "Mild", fr: "Discrète", ar: "خفيفة" } },
      { value: 2, label: { en: "Moderate", fr: "Moyenne", ar: "متوسطة" } },
      { value: 3, label: { en: "Severe", fr: "Grave", ar: "شديدة" } },
      { value: 4, label: { en: "Disabling", fr: "Frappant le sujet d'incapacité fonctionnelle", ar: "معيقة" } }
    ]
  },
  {
    id: "hdrs-12",
    text: {
      en: "Gastrointestinal somatic symptoms",
      fr: "Symptômes somatiques gastro-intestinaux",
      ar: "أعراض جسدية هضمية"
    },
    options: [
      { value: 0, label: { en: "None", fr: "Aucun", ar: "لا يوجد" } },
      { value: 1, label: { en: "Loss of appetite but eats without urging; heaviness", fr: "Perte d'appétit mais mange sans y être poussé. Sentiment de lourdeur abdominale", ar: "فقدان شهية مع ثقل بطني" } },
      { value: 2, label: { en: "Difficulty eating without encouragement; laxatives or GI meds needed", fr: "A des difficultés à manger en l'absence d'incitations. Demande ou besoins de laxatifs, de médicaments intestinaux", ar: "صعوبة في الأكل دون تشجيع" } }
    ]
  },
  {
    id: "hdrs-13",
    text: {
      en: "General somatic symptoms",
      fr: "Symptômes somatiques généraux",
      ar: "أعراض جسدية عامة"
    },
    options: [
      { value: 0, label: { en: "None", fr: "Aucun", ar: "لا يوجد" } },
      { value: 1, label: { en: "Heaviness, pain, fatigue", fr: "Lourdeur dans les membres, dans le dos ou la tête. Douleurs dans le dos, céphalées, douleurs musculaires, perte d'énergie et fatigabilité", ar: "ثقل أو ألم أو تعب" } },
      { value: 2, label: { en: "Any symptom is marked", fr: "Si n'importe quel symptôme est net", ar: "إذا كان أي عرض واضحا" } }
    ]
  },
  {
    id: "hdrs-14",
    text: {
      en: "Genital symptoms",
      fr: "Symptômes génitaux (perte de libido, troubles menstruels)",
      ar: "أعراض تناسلية"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absents", ar: "غائبة" } },
      { value: 1, label: { en: "Mild", fr: "Légers", ar: "خفيفة" } },
      { value: 2, label: { en: "Severe", fr: "Graves", ar: "شديدة" } }
    ]
  },
  {
    id: "hdrs-15",
    text: {
      en: "Hypochondriasis",
      fr: "Hypochondrie",
      ar: "توهم المرض"
    },
    options: [
      { value: 0, label: { en: "Absent", fr: "Absente", ar: "غائبة" } },
      { value: 1, label: { en: "Focus on own body", fr: "Attention concentrée sur son propre corps", ar: "انتباه مركز على جسده" } },
      { value: 2, label: { en: "Concerns about health", fr: "Préoccupations sur sa santé", ar: "قلق بشأن صحته" } },
      { value: 3, label: { en: "Frequent complaints, requests for help", fr: "Plaintes fréquentes, demandes d'aide", ar: "شكاوى متكررة وطلبات مساعدة" } },
      { value: 4, label: { en: "Hypochondriacal delusions", fr: "Idées délirantes hypochondriaques", ar: "أوهام توهم المرض" } }
    ]
  },
  {
    id: "hdrs-16",
    text: {
      en: "Loss of weight",
      fr: "Perte de poids",
      ar: "فقدان الوزن"
    },
    options: [
      { value: 0, label: { en: "No weight loss", fr: "Pas de perte de poids", ar: "لا فقدان وزن" } },
      { value: 1, label: { en: "Probable weight loss due to current illness", fr: "Perte de poids probable liée à la maladie actuelle", ar: "فقدان وزن محتمل بسبب المرض الحالي" } },
      { value: 2, label: { en: "Definite weight loss", fr: "Perte de poids certaine", ar: "فقدان وزن مؤكد" } }
    ]
  },
  {
    id: "hdrs-17",
    text: {
      en: "Insight",
      fr: "Prise de conscience",
      ar: "الاستبصار"
    },
    options: [
      { value: 0, label: { en: "Recognizes he is depressed and ill", fr: "Reconnaît qu'il est déprimé et malade", ar: "يعترف بأنه مكتئب ومريض" } },
      { value: 1, label: { en: "Recognizes illness but attributes it to external causes", fr: "Reconnaît qu'il est malade mais l'attribue à la nourriture, au climat, au surmenage, à un virus, à un besoin de repos, etc.", ar: "يعترف بأنه مريض لكنه ينسبه لأسباب خارجية" } },
      { value: 2, label: { en: "Denies being ill", fr: "Nie qu'il est malade", ar: "ينكر أنه مريض" } }
    ]
  }
];
