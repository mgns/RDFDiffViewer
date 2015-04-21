start
  = stmtlist

stmtlist 
  = (stmtline)*

stmtline
  = stmt:stmt newline? 
  { return stmt }

stmt
  = predicate:predicate_with_space object:object 
  { return {predicate:predicate, object:object} }

predicate_with_space
  = predicate:iri ' ' 
  { return predicate } 
  
object
  = literal / iri

iri
  = iri:(unprefixed_iri/prefixed_iri) 
  { iri.node = "iri"; return iri }
  
unprefixed_iri
  = '<' chars:irichar* '>' 
  { return {plain:chars.join('')} }

prefixed_iri
  = prefix:prefix_with_colon suffix:suffix 
  { return {prefix:prefix, suffix:suffix} }

prefix_with_colon = prefix:prefix_string ':'
  { return prefix }

suffix = chars:irichar* 
  { return chars.join('') }

literal
  = untagged:untagged_literal language:language_tag? type:type_tag?
  { var lit = { node:'literal', plain:untagged };  
    if(language != null)
      lit.language = language;
    if(type != null)
      lit.type = type;
    return lit }

untagged_literal
  = single_quote_literal 
  
single_quote_literal 
  = '"' chars:(literalchar / "\\\"")* '"' 
  { return chars.join('') }
  
language_tag 
  = '@' lang:langtag_string
  { return lang }

type_tag
  = '^^' type:(iri/untagged_literal) 
  { return type }


literalchar = ([^\x22\x5c\x0a\x0d] / echar / uchar)
irichar = [^\x00-\x20<>"{}|^`\\] / uchar
uchar = ("\\u" hex hex hex hex) / ("\\U" hex hex hex hex hex hex hex hex)
echar = "\\" [tbnrf"'\\]
hex = [0-9a-fA-F]

newline = [\n\r]+

pnchars
  = pncharsu / "-" / [0-9] / [\u00b7] / [\u0300-\u036f] / [\u203F-\u2040]

pncharsu
  = pncharsbase / "_" 

pncharsbase
  = [A-Z] / [a-z] / [\u00C0-\u00d6] / [\u00D8-\u00f6] / [\u00f8-\u02ff]
  / [\u0370-\u037d] / [\u037f-\u1fff] / [\u200C-\u200d] / [\u2070-\u218f]
  / [\u2c00-\u2fef] / [\u3001-\ud7ff] / [\uf900-\ufdcf] / [\ufdf0-\ufffd] 
  //[\u10000-\ueffff] cannot be parsed

langtag_string
  = chars1:[a-zA-Z]+ chars2:('-' [a-zA-Z0-9]+)*
  { return chars1.join('') + chars2.join('') }

prefix_string 
  = chars1:pncharsbase chars2:pnchars* 
  { return chars1 + chars2.join('') }
