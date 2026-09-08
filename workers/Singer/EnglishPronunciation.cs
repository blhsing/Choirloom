public static class EnglishPronunciation {
 public static bool TryGet(Dictionary<string,string[]> dictionary,string word,out string[] phones){
  word=word.Replace('’','\'').Replace('‘','\'').ToLowerInvariant();
  if(dictionary.TryGetValue(word,out phones!))return true;
  if(word.EndsWith("'s")&&dictionary.TryGetValue(word[..^2],out var possessive)){
   var last=possessive.Last().Split('/').Last();var prefix=possessive.Last().Contains('/')?"en/":"";
   var ending=new[]{"s","z","sh","zh","ch","jh"}.Contains(last)?new[]{prefix+"ih",prefix+"z"}:new[]{prefix+(new[]{"p","t","k","f","th"}.Contains(last)?"s":"z")};
   phones=possessive.Concat(ending).ToArray();return true;
  }
  // Sung -in' is the dictionary -ing with an alveolar n, not a new lyric.
  if(word.EndsWith("in'")&&dictionary.TryGetValue(word[..^1]+"g",out var full)){
   phones=full.Select(p=>p is "en/ng" or "ng"?p.Replace("ng","n"):p).ToArray();return true;
  }
  return dictionary.TryGetValue(word.Trim('\''),out phones!);
 }
}
