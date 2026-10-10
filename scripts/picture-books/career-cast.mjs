// 人物身份在整本内固定；逐页选出场人物，避免参考图将家长或配角带入无关场景。
const person=(name,description,visual,relation)=>({name,description,visual,...(relation?{relation}:{})});
const chen=person("陈老师","中国男性幼儿园老师，黑色短发、圆框眼镜、薄荷绿色上衣、米色长裤、灰色平底鞋。","Teacher Chen: Chinese man age30, short black hair, round glasses, mint-green polo shirt, beige trousers, grey flat sneakers.");
const mimi=person("米米","中国小女孩，黑色双马尾、珊瑚红连衣裙、白色圆领、粉白色平底鞋。","Mimi: Chinese girl age5, two black pigtails, coral-red dress with white rounded collar, pink-and-white flat shoes.");
const haohao=person("浩浩","中国小男孩，黑色短发侧分刘海、蓝白条纹短袖、蓝色短裤、蓝白色运动鞋。","Haohao: Chinese boy age5, short black hair with side fringe, blue-and-white striped T-shirt, blue shorts, blue-and-white sneakers.");
const teddy=person("小熊玩偶","棕色毛绒小熊，米色肚皮和脚掌、红色蝴蝶结，是角色扮演用的玩偶。","Teddy: brown stuffed toy bear with beige belly and paw pads, red bow tie; an inanimate toy.");
const caregiver=person("刘阿姨","幼儿园保育老师，棕色低盘发、浅桃色白领短袖工作服，胸前小熊图案、米色长裤、白色平底鞋。","Caregiver Liu: Chinese woman age35, brown hair in a LOW neat bun, pale-peach SHORT-SLEEVED work smock with white collar and small bear emblem, cream trousers, white flat shoes.");
const doctorChild=person("小安","五岁中国小男孩，黑色圆刘海短发、黄色短袖、青蓝色背带裤、白色运动鞋。","Xiao An: Chinese boy age5, short rounded black hair, yellow T-shirt, turquoise bib overalls, white sneakers.");
const doctorMom=person("小安妈妈","棕色齐肩长发、粉色短袖、蓝色牛仔裤、奶油色平底鞋，米色帆布包。","Xiao An's mother: Chinese woman age32, shoulder-length dark-brown hair with side part, pink short-sleeved T-shirt, blue jeans, cream flat shoes, beige canvas shoulder bag outdoors.","妈妈");
const firefighterChild=person("小宇","五岁中国小男孩，黑色侧分短发、翠绿色短袖、深蓝色短裤、黄色运动鞋。","Xiao Yu: Chinese boy age5, short black SIDE-PARTED hair, emerald-green plain T-shirt, navy-blue SHORTS, yellow sneakers; never bib overalls.");
const firefighterDad=person("小宇爸爸","中国男性家长，黑色短发、深蓝色翻领短袖、米色长裤、白色运动鞋，无眼镜。","Xiao Yu's father: Chinese man age34, short black hair, clean-shaven, no glasses, navy-blue polo shirt, beige full-length chinos, white sneakers.","爸爸");
const teacherChild=person("朵朵","五岁中国小女孩，黑色齐耳直发与齐刘海、黄色星形发夹、淡紫色白领短袖连衣裙、白袜、白色魔术贴鞋。","Duoduo: Chinese girl age5, neat chin-length straight black BOB with straight bangs, one small yellow STAR hair clip at exactly the same side of her bangs as the reference, lavender short-sleeved dress with white rounded collar, white ankle socks, white velcro shoes; never overalls, never yellow shirt.");
const teacherDad=person("朵朵爸爸","中国男性家长，黑色短发、深色方框眼镜、蓝绿色翻领短袖、炭灰色长裤、白色运动鞋。","Duoduo's father: Chinese man age34, short black hair, dark rectangular glasses, TEAL polo shirt, charcoal-grey full-length trousers, white sneakers.","爸爸");
const teacherMom=person("朵朵妈妈","中国女性家长，深棕色低马尾、奶油色短袖衬衫、鼠尾草绿长裤、白色平底鞋。","Duoduo's mother: Chinese woman age32, long dark-brown hair tied in LOW PONYTAIL, cream short-sleeved blouse, sage-green full-length trousers, white flats; never pink T-shirt.","妈妈");
const zhou=person("周阿姨","中国女性消防员，黑色低马尾、黄色头盔、米黄色消防服、黄银反光条、黑色防护靴。","Firefighter Zhou: adult Chinese woman age28, black LOW PONYTAIL, yellow helmet, tan-beige turnout suit with yellow/silver reflective bands, black boots.");
const zhang=person("张叔叔","中国男性消防员，黑色寸头、黄色头盔、米黄色消防服、黄银反光条、黑色防护靴。","Firefighter Zhang: adult Chinese man age30, black buzz cut, yellow helmet, tan-beige turnout suit with yellow/silver reflective bands, black boots.");
export const careerCastByBook={
 doctor:{child:doctorChild,family:[doctorMom],supportingCharacters:[
  person("周护士","中国女性护士，棕色盘发、浅粉色护士服、白色平底鞋。","Nurse Zhou: Chinese woman age30, brown hair in a high neat bun, pale-pink scrub top and trousers, white flat shoes."),
  person("圆圆","中国小女孩，黑色双马尾、珊瑚红白领连衣裙、红色鞋子，抱着粉色小兔玩偶。","Yuanyuan: Chinese girl age4, two low black pigtails, coral-red dress with white collar, red shoes, holding pink stuffed bunny."),
  person("圆圆爸爸","中国男性家长，黑色短发、浅薄荷绿色翻领短袖、深灰色长裤、白色运动鞋。","Yuanyuan's father: Chinese man age32, short black hair, light-mint polo shirt, dark-grey trousers, white sneakers."),
  person("李医生","视频会诊中的中国男性医生，黑色短发、圆框眼镜、白大褂和蓝色工作服。","Doctor Li: adult Chinese male doctor on video screen, short black hair, round glasses, white coat over blue scrubs."),teddy]},
 firefighter:{child:firefighterChild,family:[firefighterDad],supportingCharacters:[zhou,zhang,
  person("社区阿姨","中国女性社区工作人员，棕色齐肩发、蓝绿色马甲、白色上衣、深蓝色长裤。","Community staff woman: Chinese adult, shoulder-length brown hair, teal vest over white shirt, navy trousers."),chen,mimi,haohao]},
 teacher:{child:teacherChild,family:[teacherDad,teacherMom],supportingCharacters:[mimi,haohao,caregiver,teddy]}
};

export function careerCastForPage(book,position) {
 const {child,family,supportingCharacters:s}=book;
 const byName=name=>s.find(p=>p.name===name);
 if(book.slug==="doctor") {
  if(position===13)return [];
  if([14,15].includes(position))return [child,...family,byName("小熊玩偶")];
  return [child,...family,...(position===10?[byName("圆圆"),byName("圆圆爸爸")]:position===11?[byName("周护士")]:position===12?[byName("李医生")]:[])];
 }
 if(book.slug==="firefighter") {
  if(position===15)return [child,byName("陈老师"),byName("米米"),byName("浩浩")];
  return [child,...family,...(position===7?[byName("张叔叔")]:[8,9,16].includes(position)?[byName("周阿姨")]:position===12?[byName("社区阿姨")]:position===13?[byName("周阿姨"),byName("张叔叔")]:[])];
 }
 if(position===14)return [byName("刘阿姨")];
 if(position===15)return [child,...family,byName("小熊玩偶")];
 return [child,...([1,13].includes(position)?family:[]),...([3].includes(position)?[]:[byName("米米"),byName("浩浩")]),...(position===9?[byName("刘阿姨")]:[])];
}
