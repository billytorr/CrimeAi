// ── Internationalization ─────────────────────────────────────────────
// Lightweight, dependency-free i18n that works with the static export /
// Capacitor build. English text IS the key: t("Feed") returns the active
// locale's translation or falls back to the English key itself, so any
// not-yet-translated string simply shows in English (never a blank/key).
//
// Languages chosen for the Miami beta: English, Spanish, Haitian Creole,
// Brazilian Portuguese — the four most-spoken languages in the metro.

export type Lang = "en" | "es" | "ht" | "pt";

export const LANGS: { code: Lang; label: string; english: string }[] = [
  { code: "en", label: "English", english: "English" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "ht", label: "Kreyòl Ayisyen", english: "Haitian Creole" },
  { code: "pt", label: "Português", english: "Portuguese" },
];

export const LANG_STORAGE_KEY = "pscc_lang";

// Map a device/browser locale (e.g. "es-US", "pt-BR", "ht") to a supported
// language. Falls back to English.
export function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const candidates = [navigator.language, ...(navigator.languages || [])];
  for (const c of candidates) {
    const base = (c || "").toLowerCase().split("-")[0];
    if (base === "es" || base === "ht" || base === "pt" || base === "en") return base as Lang;
  }
  return "en";
}

// The user's saved choice wins; otherwise follow the device language so
// non-English speakers land in their language automatically.
export function initialLang(): Lang {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(LANG_STORAGE_KEY) as Lang | null;
  if (saved && LANGS.some((l) => l.code === saved)) return saved;
  return detectLang();
}

type Dict = Record<string, string>;

// Only NON-English translations live here; English is the fallback key.
const es: Dict = {
  // nav
  "Feed": "Inicio", "Map": "Mapa", "CrimeAi": "CrimeAI", "Inbox": "Buzón", "You": "Tú",
  // feed tabs
  "For You": "Para ti", "Local": "Local", "News": "Noticias", "Trending": "Tendencias",
  // common actions
  "Continue": "Continuar", "Continue →": "Continuar →", "Cancel": "Cancelar", "Back": "Atrás",
  "Save": "Guardar", "Done": "Listo", "Log in": "Iniciar sesión", "Log in →": "Iniciar sesión →",
  "Create account": "Crear cuenta", "Search": "Buscar", "Settings": "Configuración",
  "Edit profile": "Editar perfil", "Follow": "Seguir", "Following": "Siguiendo", "Followers": "Seguidores",
  "Message": "Mensaje", "Verify →": "Verificar →", "Resend code": "Reenviar código",
  "Change photo": "Cambiar foto", "Add photo": "Agregar foto", "Change": "Cambiar",
  // auth
  "Create your account": "Crea tu cuenta", "Verify your email": "Verifica tu correo",
  "Pick a username & password": "Elige un usuario y contraseña", "Email": "Correo electrónico",
  "Password": "Contraseña", "Confirm password": "Confirmar contraseña", "Username": "Nombre de usuario",
  "Verification code": "Código de verificación", "Forgot password?": "¿Olvidaste tu contraseña?",
  "Reset your password": "Restablece tu contraseña", "New password": "Nueva contraseña",
  "Confirm new password": "Confirmar nueva contraseña", "Enter your recovery code": "Ingresa tu código de recuperación",
  "Choose a new password": "Elige una nueva contraseña", "Set new password →": "Guardar contraseña →",
  "Send recovery code →": "Enviar código →", "← Back to log in": "← Volver a iniciar sesión",
  "or continue with": "o continúa con",
  // onboarding
  "Create your profile": "Crea tu perfil", "Full name": "Nombre completo", "Bio": "Biografía",
  "Where's home?": "¿Dónde vives?", "Use my current location": "Usar mi ubicación actual",
  "Alerts & radius": "Alertas y radio", "Enter CrimeAI →": "Entrar a CrimeAI →",
  "Alert radius": "Radio de alerta", "Alert me about": "Avísame sobre", "Notify me via": "Notificarme por",
  "Push notifications": "Notificaciones", "Text message (SMS)": "Mensaje de texto (SMS)",
  // settings sections
  "Account": "Cuenta", "Emergency SOS": "SOS de emergencia", "Privacy": "Privacidad",
  "Appearance": "Apariencia", "Location & radius": "Ubicación y radio", "Alerts": "Alertas",
  "Trusted circle": "Círculo de confianza", "Send feedback": "Enviar comentarios",
  "Blocked accounts": "Cuentas bloqueadas", "Danger zone": "Zona de peligro", "Language": "Idioma",
  "Log out": "Cerrar sesión", "Show SOS button": "Mostrar botón SOS", "Private account": "Cuenta privada",
  "Protector Plan": "Plan Protector", "Delete account": "Eliminar cuenta",
  // SOS / safety
  "SOS": "SOS", "Safety": "Seguridad", "I'm not safe": "No estoy a salvo",
  "Walk with me": "Acompáñame", "Call 911": "Llamar al 911", "Emergency": "Emergencia",
  "Notify my circle": "Avisar a mi círculo",
  // language setting copy
  "See translation": "Ver traducción", "See original": "Ver original", "Translating": "Traduciendo", "Translated": "Traducido",
  "Please wait": "Espera",
  "App language": "Idioma de la app",
  "Choose the language for the whole app. It follows your device by default.":
    "Elige el idioma de toda la app. Por defecto sigue el idioma de tu dispositivo.",
};

const pt: Dict = {
  "Feed": "Início", "Map": "Mapa", "CrimeAi": "CrimeAI", "Inbox": "Caixa", "You": "Você",
  "For You": "Para você", "Local": "Local", "News": "Notícias", "Trending": "Em alta",
  "Continue": "Continuar", "Continue →": "Continuar →", "Cancel": "Cancelar", "Back": "Voltar",
  "Save": "Salvar", "Done": "Pronto", "Log in": "Entrar", "Log in →": "Entrar →",
  "Create account": "Criar conta", "Search": "Buscar", "Settings": "Configurações",
  "Edit profile": "Editar perfil", "Follow": "Seguir", "Following": "Seguindo", "Followers": "Seguidores",
  "Message": "Mensagem", "Verify →": "Verificar →", "Resend code": "Reenviar código",
  "Change photo": "Trocar foto", "Add photo": "Adicionar foto", "Change": "Trocar",
  "Create your account": "Crie sua conta", "Verify your email": "Verifique seu e-mail",
  "Pick a username & password": "Escolha um usuário e senha", "Email": "E-mail",
  "Password": "Senha", "Confirm password": "Confirmar senha", "Username": "Nome de usuário",
  "Verification code": "Código de verificação", "Forgot password?": "Esqueceu a senha?",
  "Reset your password": "Redefina sua senha", "New password": "Nova senha",
  "Confirm new password": "Confirmar nova senha", "Enter your recovery code": "Digite seu código de recuperação",
  "Choose a new password": "Escolha uma nova senha", "Set new password →": "Salvar senha →",
  "Send recovery code →": "Enviar código →", "← Back to log in": "← Voltar para entrar",
  "or continue with": "ou continue com",
  "Create your profile": "Crie seu perfil", "Full name": "Nome completo", "Bio": "Biografia",
  "Where's home?": "Onde você mora?", "Use my current location": "Usar minha localização",
  "Alerts & radius": "Alertas e raio", "Enter CrimeAI →": "Entrar no CrimeAI →",
  "Alert radius": "Raio de alerta", "Alert me about": "Avise-me sobre", "Notify me via": "Notificar por",
  "Push notifications": "Notificações", "Text message (SMS)": "Mensagem de texto (SMS)",
  "Account": "Conta", "Emergency SOS": "SOS de emergência", "Privacy": "Privacidade",
  "Appearance": "Aparência", "Location & radius": "Localização e raio", "Alerts": "Alertas",
  "Trusted circle": "Círculo de confiança", "Send feedback": "Enviar feedback",
  "Blocked accounts": "Contas bloqueadas", "Danger zone": "Zona de perigo", "Language": "Idioma",
  "Log out": "Sair", "Show SOS button": "Mostrar botão SOS", "Private account": "Conta privada",
  "Protector Plan": "Plano Protetor", "Delete account": "Excluir conta",
  "SOS": "SOS", "Safety": "Segurança", "I'm not safe": "Não estou seguro",
  "Walk with me": "Caminhe comigo", "Call 911": "Ligar 911", "Emergency": "Emergência",
  "Notify my circle": "Avisar meu círculo",
  "See translation": "Ver tradução", "See original": "Ver original", "Translating": "Traduzindo", "Translated": "Traduzido",
  "Please wait": "Aguarde",
  "App language": "Idioma do app",
  "Choose the language for the whole app. It follows your device by default.":
    "Escolha o idioma de todo o app. Por padrão, segue o idioma do seu dispositivo.",
};

const ht: Dict = {
  "Feed": "Fil", "Map": "Kat", "CrimeAi": "CrimeAI", "Inbox": "Mesaj", "You": "Ou",
  "For You": "Pou ou", "Local": "Lokal", "News": "Nouvèl", "Trending": "Tandans",
  "Continue": "Kontinye", "Continue →": "Kontinye →", "Cancel": "Anile", "Back": "Retounen",
  "Save": "Anrejistre", "Done": "Fini", "Log in": "Konekte", "Log in →": "Konekte →",
  "Create account": "Kreye kont", "Search": "Chèche", "Settings": "Paramèt",
  "Edit profile": "Modifye pwofil", "Follow": "Swiv", "Following": "W ap swiv", "Followers": "Moun k ap swiv",
  "Message": "Mesaj", "Verify →": "Verifye →", "Resend code": "Voye kòd ankò",
  "Change photo": "Chanje foto", "Add photo": "Ajoute foto", "Change": "Chanje",
  "Create your account": "Kreye kont ou", "Verify your email": "Verifye imel ou",
  "Pick a username & password": "Chwazi yon non itilizatè ak modpas", "Email": "Imel",
  "Password": "Modpas", "Confirm password": "Konfime modpas", "Username": "Non itilizatè",
  "Verification code": "Kòd verifikasyon", "Forgot password?": "Bliye modpas?",
  "Reset your password": "Reyajiste modpas ou", "New password": "Nouvo modpas",
  "Confirm new password": "Konfime nouvo modpas", "Enter your recovery code": "Antre kòd rekiperasyon ou",
  "Choose a new password": "Chwazi yon nouvo modpas", "Set new password →": "Anrejistre modpas →",
  "Send recovery code →": "Voye kòd →", "← Back to log in": "← Retounen pou konekte",
  "or continue with": "oswa kontinye avèk",
  "Create your profile": "Kreye pwofil ou", "Full name": "Non konplè", "Bio": "Byografi",
  "Where's home?": "Kote ou rete?", "Use my current location": "Sèvi ak kote m ye a",
  "Alerts & radius": "Alèt ak reyon", "Enter CrimeAI →": "Antre nan CrimeAI →",
  "Alert radius": "Reyon alèt", "Alert me about": "Avèti m sou", "Notify me via": "Notifye m pa",
  "Push notifications": "Notifikasyon", "Text message (SMS)": "Mesaj tèks (SMS)",
  "Account": "Kont", "Emergency SOS": "SOS Ijans", "Privacy": "Konfidansyalite",
  "Appearance": "Aparans", "Location & radius": "Kote ak reyon", "Alerts": "Alèt",
  "Trusted circle": "Sèk konfyans", "Send feedback": "Voye kòmantè",
  "Blocked accounts": "Kont bloke", "Danger zone": "Zòn danje", "Language": "Lang",
  "Log out": "Dekonekte", "Show SOS button": "Montre bouton SOS", "Private account": "Kont prive",
  "Protector Plan": "Plan Pwotektè", "Delete account": "Efase kont",
  "SOS": "SOS", "Safety": "Sekirite", "I'm not safe": "Mwen pa an sekirite",
  "Walk with me": "Mache avè m", "Call 911": "Rele 911", "Emergency": "Ijans",
  "Notify my circle": "Avèti sèk mwen",
  "See translation": "Wè tradiksyon", "See original": "Wè orijinal", "Translating": "Ap tradui", "Translated": "Tradui",
  "Please wait": "Tann",
  "App language": "Lang aplikasyon an",
  "Choose the language for the whole app. It follows your device by default.":
    "Chwazi lang pou tout aplikasyon an. Pa default li swiv aparèy ou.",
};

const DICTS: Record<Lang, Dict> = { en: {}, es, ht, pt };

export function translate(lang: Lang, key: string): string {
  if (lang === "en") return key;
  return DICTS[lang]?.[key] ?? key;
}

// ── Post language detection (for the per-post "See translation" option) ─
// Lightweight stopword + diacritic heuristic — enough to tell whether a
// post is in a DIFFERENT language than the reader's, which is all we need
// to decide whether to offer a translation (like Instagram/TikTok).
const STOP: Record<Lang, string[]> = {
  en: ["the", "and", "to", "of", "in", "is", "that", "for", "with", "you", "on", "are", "this", "it", "at", "was", "have", "not", "your", "we"],
  es: ["el", "la", "los", "las", "de", "que", "en", "un", "una", "por", "con", "para", "está", "más", "como", "pero", "este", "muy", "su", "hay"],
  pt: ["o", "os", "as", "de", "que", "em", "um", "uma", "não", "com", "para", "você", "mais", "como", "mas", "este", "muito", "seu", "na", "está"],
  ht: ["nan", "yo", "mwen", "ou", "li", "sa", "gen", "pa", "se", "kay", "moun", "lakay", "ap", "ki", "nou", "te", "pou", "fè", "yon", "avèk"],
};

export function detectTextLang(text: string): Lang | null {
  const words = (text || "").toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length < 3) return null; // too short to tell
  const set = new Set(words);
  const scores: Record<Lang, number> = { en: 0, es: 0, pt: 0, ht: 0 };
  (Object.keys(STOP) as Lang[]).forEach((l) => { for (const w of STOP[l]) if (set.has(w)) scores[l]++; });
  if (/[ñ¿¡]/.test(text)) scores.es += 2;
  if (/[ãõ]/i.test(text)) scores.pt += 2;
  if (/\b(w|m|n|k)['’]/i.test(text) || /\bap\b/i.test(text)) scores.ht += 1;
  let best: Lang = "en", bestScore = 0;
  (Object.keys(scores) as Lang[]).forEach((l) => { if (scores[l] > bestScore) { bestScore = scores[l]; best = l; } });
  return bestScore >= 1 ? best : null;
}

export const LANG_NAME: Record<Lang, string> = {
  en: "English", es: "Spanish", ht: "Haitian Creole", pt: "Portuguese",
};
