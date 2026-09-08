export function preferredLocale(primaryLanguage:string|undefined|null):'en'|'zh-Hant'{return /^zh(?:-|_|;|,|$)/i.test((primaryLanguage||'en').trim())?'zh-Hant':'en';}
