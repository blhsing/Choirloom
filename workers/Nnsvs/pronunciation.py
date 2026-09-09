"""Deterministic Japanese phoneme approximations; written lyrics stay unchanged."""
import re
import unicodedata

ARPABET = dict(zip(
    'AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH'.split(),
    ['a','a','a','o','a u','a i','b','ch','d','z','e','a','e i','f','g','h','i','i','j','k','r','m','n','N','o u','o i','p','r','s','sh','t','s','u','u','b','w','y','z','j']))
VOWELS = set('aiueo')
WORDLESS = {'ah':'a','woo':'u','ba':'b a','da':'d a','bom':'b o N','dum':'d a N','doo':'d u','dap':'d a p','bwee':'b u i'}
_dictionary = None
_kana = None

def english_phones(word):
    global _dictionary
    if _dictionary is None:
        import cmudict
        _dictionary = cmudict.dict()
    word = word.lower().replace('’', "'").strip("-.,!?;:\" ")
    phones = _dictionary.get(word)
    if not phones and word.endswith("in'"):
        found = _dictionary.get(word[:-1]+'g')
        if found: phones = [found[0][:-1]+['N']]
    if not phones and word.startswith("'"): phones = _dictionary.get(word[1:])
    if not phones and word.endswith("'s"):
        found = _dictionary.get(word[:-2])
        if found: phones = [found[0]+['Z']]
    if phones: return [re.sub(r'\d', '', p) for p in phones[0]]
    return None

def romanize(text):
    from unidecode import unidecode
    return unidecode(text).lower()

def approximate(text, language='en'):
    global _kana
    text = unicodedata.normalize('NFKC', text).strip()
    if not text: return []
    if text.lower() in WORDLESS: return WORDLESS[text.lower()].split()
    if text.startswith('[') and text.endswith(']'):
        return [v for p in text[1:-1].split() for v in (p[3:] if p.startswith('ja/') else ARPABET.get(p.split('/')[-1].upper(),p.split('/')[-1])).split()]
    if language.startswith('ja') or re.search('[ぁ-ヿ]', text):
        from pykakasi import kakasi
        if _kana is None: _kana = kakasi()
        text = ''.join(p['hepburn'] for p in _kana.convert(text))
    elif re.search('[\u4e00-\u9fff]', text):
        from pypinyin import lazy_pinyin
        text = ' '.join(lazy_pinyin(text))
    else:
        phones = english_phones(text) if language.startswith('en') else None
        if phones: return [v for p in phones for v in ARPABET.get(p,'').split()]
    # Unlisted words retain a phonetic reading instead of being replaced by "ah".
    text = romanize(text)
    pieces = re.findall(r'sh|ch|ts|th|ng|ny|hy|ky|gy|ry|by|py|my|[a-z]',text)
    aliases = {'l':'r','v':'b','q':'k','c':'k','x':'k s','th':'s','ng':'N'}
    return [p for s in pieces for p in aliases.get(s,s).split()]

def split_syllables(phones, count):
    """Keep phoneme order while aligning a complete word to its written syllables."""
    if count == 1: return [phones]
    vowel_positions = [i for i,p in enumerate(phones) if re.sub(r'\d','',p) in ARPABET and re.sub(r'\d','',p)[:1] in 'AEIOU']
    if len(vowel_positions) >= count:
        cuts = [0]+[vowel_positions[round(i*len(vowel_positions)/count)] for i in range(1,count)]+[len(phones)]
    else:
        cuts = [round(i*len(phones)/count) for i in range(count+1)]
    return [phones[cuts[i]:cuts[i+1]] for i in range(count)]

def note_phones(notes, language, wordless):
    result = {}; i = 0; last_vowel = 'a'
    untexted = not any(n.get('lyric','').strip() for n in notes if n['pitch'] is not None)
    while i < len(notes):
        note = notes[i]
        if note['pitch'] is None: i += 1; continue
        lyric = note.get('lyric','').strip(); group = [note]
        if lyric and note.get('syllabic') == 'begin':
            for nxt in notes[i+1:]:
                if nxt['pitch'] is None or nxt.get('syllabic') not in ('middle','end'): break
                group.append(nxt)
                if nxt.get('syllabic') == 'end': break
        whole = ''.join(n.get('lyric','').strip('- ') for n in group)
        native = english_phones(whole) if len(group)>1 and language.startswith('en') else None
        split = split_syllables(native,len(group)) if native else None
        for j,n in enumerate(group):
            if split:
                symbols = [v for p in split[j] for v in ARPABET.get(p,'').split()]
            elif n.get('lyric','').strip(): symbols = approximate(n['lyric'],language)
            elif untexted:
                pattern = {'scat':['da','ba','doo','dap'],'ba':['ba','ba','bom'],'da':['da','da','dum']}.get(wordless,[wordless])
                symbols = approximate(pattern[i % len(pattern)])
            else: symbols = [last_vowel]  # untexted continuation, never modify score lyrics
            if not symbols: raise ValueError('unknownPronunciation: '+n.get('lyric',''))
            last_vowel = next((p for p in reversed(symbols) if p in VOWELS),last_vowel)
            result[n['id']] = symbols
        i += len(group)
    return result
