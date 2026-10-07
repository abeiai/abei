type Story = { slug: string; title: string; theme: string; companion: string; companionDescription: string; characterPrompt: string; coverPrompt: string; pageImageVersions?: Record<number, string>; story: readonly (readonly [string, string])[] };

export const additionalLeleStories: Story[] = [
  {
    slug: "lele-fox", title: "小狐狸说实话", theme: "诚实与承担责任", companion: "小狐狸菲菲",
    pageImageVersions: { 1: "v2", 2: "v2", 3: "v2", 4: "v2", 5: "v2", 6: "v2", 7: "v2", 8: "v2", 9: "v2" },
    companionDescription: "橙红色小狐狸，奶油色嘴巴和胸口，尖耳朵，白色尾尖，戴青蓝色小围巾。",
    characterPrompt: "Feifei: small russet-orange fox, cream muzzle and chest, pointed ears, large white-tipped tail, short muted teal scarf; no other clothing.",
    coverPrompt: "熊猫乐乐与小狐狸菲菲一起蹲在修补好的芥黄色风筝旁，神情轻松，相视微笑，金色初秋森林。",
    story: [
      ["乐乐做了一只黄色风筝，放在树根旁。他去找长长的线，菲菲留下来看风筝。", "Wide morning forest: panda puts a mustard-yellow kite at oak roots; fox watches as panda reaches for a spool of string."],
      ["“尾巴真漂亮！”菲菲想让风筝飞一下。咔嚓，小竹条折了，纸也裂了一道口子。", "Close action: fox lifts the yellow kite; its thin bamboo rib snaps and yellow paper tears, fox's eyes widen. Panda absent."],
      ["乐乐回来了。“风筝怎么坏了？”菲菲把爪子藏到身后：“是风吹的。”", "Medium two-shot: panda examines broken kite; fox hides paws behind back and looks worried, fallen leaves around."],
      ["乐乐看了看安静的树叶。菲菲低着头，肚子里像装了一颗小石头。", "Quiet close scene: fox looks down uneasily beside still leaves; panda glances between kite and motionless canopy."],
      ["他们找来新竹条，可菲菲怎么也笑不出来。那颗“小石头”越来越重了。", "Fox carries replacement bamboo beside panda, distracted and downcast; broken yellow kite visible on moss."],
      ["“乐乐，其实……是我弄坏的。”菲菲停下来，“我怕你不想和我玩了。”", "Eye-level confession: fox stops and opens both paws toward broken kite; panda turns to listen gently."],
      ["乐乐皱了一下眉：“风筝坏了，我很难过。你没说实话，我也有点生气。”", "Close panda with sad, mildly hurt expression, not rage; fox listens respectfully, kite between them."],
      ["菲菲轻声说：“对不起。我可以和你一起修吗？”乐乐想了想，点点头。", "Fox offers bamboo and string with a hopeful apology; panda pauses then nods, medium forest scene."],
      ["乐乐扶住竹条，菲菲慢慢缠线。歪歪的小结，被他们拆开又绑了一次。", "Overhead detailed craft: panda steadies yellow kite rib while fox wraps string carefully, spare string on moss."],
      ["风筝修好了，上面多了一片补丁。菲菲说：“以后动你的东西，我会先问。”", "Pair proudly hold repaired yellow kite with a small cream patch; fox gestures toward kite, warm sunlight."],
      ["风吹起来了。乐乐把线轴递给菲菲：“这次，我们一起放。”", "Wide meadow clearing within forest: panda shares wooden spool with fox; repaired kite begins rising safely."],
      ["黄色风筝飞过树梢。菲菲的心轻了，乐乐也笑了。那片补丁，在阳光里亮亮的。", "Final wide forest clearing: panda and fox smiling shoulder to shoulder flying patched yellow kite above tall teal trees."]
    ]
  },
  {
    slug: "lele-deer", title: "小鹿也会害怕", theme: "表达害怕与互相支持", companion: "小鹿朵朵",
    companionDescription: "浅棕色小鹿，背上白色斑点，奶油色肚子，大耳朵，脖子系淡黄色小丝带，没有鹿角。",
    characterPrompt: "Duoduo: small fawn, light cinnamon fur, white back spots, cream belly, large ears, pale yellow neck ribbon, no antlers, no other clothes.",
    coverPrompt: "熊猫乐乐与小鹿朵朵提着一盏暖黄色的小灯，并肩站在黄昏森林的宽宽小路上，互相鼓励。",
    story: [
      ["太阳快落山了，乐乐和朵朵要把小灯送回树洞。森林小路慢慢暗下来。", "Wide dusk forest: panda carries a small glowing wooden lantern walking with spotted fawn toward a distant low tree hollow."],
      ["灌木里响了一声。乐乐停住脚：“是什么呀？”他的耳朵一下子竖了起来。", "Panda pauses at a rustling bush, gently startled, lantern held low; fawn looks toward the leaves."],
      ["朵朵站得直直的：“我一点也不怕！”可她的蹄子，悄悄往乐乐身边挪。", "Medium fawn pretending brave with upright neck while edging close to panda; dark teal trunks and soft twilight."],
      ["又一阵沙沙声。朵朵躲到乐乐身后，连脖子上的丝带都抖了一下。", "Fawn hides behind panda at moving fern fronds, yellow ribbon trembles, warm lantern circle on ground."],
      ["乐乐回过头：“你也害怕吗？”朵朵的耳朵垂下来了。", "Intimate eye-level: panda gently turns toward fawn with lowered ears; no threatening shapes or extra animals."],
      ["“有一点。”朵朵说，“我怕说出来，你会笑我。”", "Close fawn admits fear beside lantern, cheeks soft and eyes hesitant; panda listens without laughing."],
      ["“我也有一点。”乐乐说，“我们可以一起想办法。”朵朵慢慢抬起头。", "Panda rests a paw on own chest acknowledging fear; fawn looks relieved, both within warm lamplight."],
      ["他们先站住，听了听。沙沙声停了，几片干叶子从灌木上落下来。", "Pair quietly observe dry leaves falling from a bush as breeze settles; lantern illuminates harmless leaves."],
      ["朵朵举灯，乐乐看路。他们把灯照向脚下，一步一步走在宽宽的小路上。", "Low wide view: fawn carries lantern by its handle, panda checks broad clear path; walking close at safe pace."],
      ["“那里有个树根。”乐乐提醒。朵朵说：“我看见啦。谢谢你。”", "Panda points to exposed root on path; fawn carefully steps around it, lantern lights the obstacle."],
      ["树洞到了。他们把小灯放进去，脸上都暖暖的。", "Pair place glowing lantern inside safe low tree hollow, warm light washes faces, peaceful dusk woods."],
      ["回家的路上，朵朵说：“有朋友在，害怕也可以说出来。”乐乐点点头，和她并肩走。", "Final sunset path: panda and fawn walk shoulder to shoulder through gentle teal and ochre forest, calm relieved smiles."]
    ]
  },
  {
    slug: "lele-bear", title: "最后一块饼干", theme: "分享与尊重彼此的需要", companion: "小熊暖暖",
    pageImageVersions: { 3: "v2", 5: "v2", 6: "v2", 7: "v2", 8: "v2", 9: "v2", 11: "v2" },
    companionDescription: "蜜棕色小熊，圆耳朵，浅奶油色口鼻，系鼠尾草绿色小围兜，身形比乐乐小。",
    characterPrompt: "Nuannuan: small honey-brown bear smaller than Lele, round ears, cream muzzle, short sage-green bib; distinguish clearly from the black-white panda.",
    coverPrompt: "熊猫乐乐与小熊暖暖坐在森林野餐布两边，面前是一块掰成两半的圆饼干和两只木杯，午后暖光。",
    story: [
      ["暖暖在林间铺好野餐布。盒子里，剩下一块圆圆的饼干。", "Small honey-brown bear lays a checked picnic cloth on woodland moss, open tin with exactly one round cookie; panda approaching."],
      ["乐乐坐下来：“好香呀，我可以尝尝吗？”暖暖把饼干盒往身边挪了一点。", "Panda sits across picnic cloth asking with open paw; little bear pulls single-cookie tin close, hesitant."],
      ["暖暖早上没吃饱。她很想吃这块饼干，又怕乐乐觉得她小气。", "Close small brown bear holding tin near tummy, worried eyes; panda waits in background, single cookie visible."],
      ["“那……都给你吧。”暖暖小声说。她的肚子，咕噜响了一下。", "Bear reluctantly offers whole cookie toward panda, shoulders droop; no written sound effects, gentle forest picnic."],
      ["乐乐没有接。“你也饿了，对吗？”暖暖点点头，把爪子放在肚子上。", "Panda pauses with palms relaxed, notices bear holding tummy, compassionate eye-level two-shot."],
      ["“这是你的饼干。”乐乐说，“你可以先告诉我，你想怎么分。”", "Panda gestures invitingly back toward bear and cookie, letting bear choose, picnic under dappled sun."],
      ["暖暖想了一会儿：“我想留一半，另一半给你，可以吗？”", "Bear holds round cookie and indicates dividing it, hopeful expression, panda listens with a warm smile."],
      ["“当然可以！”乐乐说，“你不想分的时候，也可以告诉我。”暖暖的肩膀松了。", "Close relieved bear with relaxed shoulders; panda smiles kindly, whole cookie still in bear's paws."],
      ["饼干咔地掰成两半。一半大，一半小，暖暖看看乐乐。", "Overhead picnic: bear breaks cookie into two visibly unequal pieces, looks toward panda; tin and two wooden cups."],
      ["乐乐拿起小的一半：“这块就够啦。”暖暖笑着吃起自己的那块。", "Pair happily eat their chosen cookie halves, panda with smaller piece and bear with larger, no guilt expressions."],
      ["乐乐倒了两杯温水。他们慢慢吃，听树叶在头顶轻轻响。", "Panda pours water from small wooden jug into two cups on picnic cloth; bear savors remaining cookie, leafy canopy."],
      ["盒子空了，暖暖的肚子不饿了。她说：“和你分享的时候，我也能照顾自己。”", "Final quiet picnic: empty open tin between content panda and small bear, two cups, warm late-afternoon forest light."]
    ]
  },
  {
    slug: "lele-raccoon", title: "浣熊的两种玩法", theme: "不同意见与共同协商", companion: "小浣熊淘淘",
    companionDescription: "灰棕色小浣熊，黑色眼罩花纹，蓬松的黑灰环纹尾巴，穿芥黄色小背心。",
    characterPrompt: "Taotao: small gray-brown raccoon with distinct black eye mask, fluffy ringed black-gray tail, mustard-yellow vest, no other clothing.",
    coverPrompt: "熊猫乐乐与小浣熊淘淘坐在浅浅的森林沙地旁，鹅卵石小城堡和弯弯石子路连在一起，愉快合作。",
    story: [
      ["小溪边有一块软软的沙地。乐乐和淘淘捡来一篮圆石子。", "Wide shallow forest brook bank: panda and raccoon carry small basket of smooth pebbles to dry sandy patch."],
      ["“搭一座城堡吧！”乐乐把石子叠高。淘淘摇摇头：“我想铺一条小路。”", "Panda stacks a few stones into small castle while raccoon lays curving pebble road, both excited about different plans."],
      ["乐乐拿走了路上的石子。淘淘皱起鼻子，又把城堡上的石子搬下来。", "Medium action: panda takes a road pebble, raccoon removes one from small tower; both frustrated, no violence."],
      ["啪嗒，城堡倒了，小路也断了。他们背对背坐着，谁也不看谁。", "Wide small broken pebble tower and interrupted road between back-to-back seated panda and raccoon, sad forest pause."],
      ["过了一会儿，乐乐转过头：“我想搭城堡，不想它被拆掉。”", "Panda turns from seated position, opens paw toward fallen stones, calmly explaining; raccoon listens over shoulder."],
      ["淘淘也转过头：“我想铺路，也不想石子总被拿走。”", "Raccoon points gently at broken curving pebble road, ringed tail curled nearby; panda attentive."],
      ["“原来你也有自己的玩法。”乐乐说。淘淘点点头：“我们都先说完，好吗？”", "Face-to-face listening two-shot, paws resting without grabbing, pebbles between them, warm forest shade."],
      ["他们把石子分成两堆，一堆搭城堡，一堆铺小路。", "Overhead pair sort basket of pebbles into two clear piles on sand, collaborative calm hands."],
      ["淘淘看着弯弯的小路：“它能不能一直通到你的城堡？”乐乐的眼睛亮了。", "Raccoon gestures along road toward panda's rebuilt little stone castle; panda lights up with new idea."],
      ["乐乐留下一个小门，淘淘铺好最后一颗石子。城堡和小路连在了一起。", "Detailed shared build: small pebble castle with doorway, curving pebble road connects to it; both carefully place stones."],
      ["一片小叶子成了小船，从路的这头“出发”。他们轮流推着它，走进城堡。", "Pair take turns gently sliding a leaf pretend-boat along dry pebble road into castle doorway, joyful imaginative play."],
      ["“你的玩法也很有趣！”乐乐说。淘淘笑了：“合在一起，又多了一种。”", "Final overhead-wide: panda and raccoon proudly sit beside complete pebble castle and winding road on sandy forest bank."]
    ]
  },
  {
    slug: "lele-turtle", title: "小乌龟的长处", theme: "发现彼此的长处", companion: "小乌龟慢慢",
    companionDescription: "小小的橄榄绿色乌龟，圆润浅绿色头和四肢，赭黄色六角纹龟壳，不穿衣服。",
    characterPrompt: "Manman: tiny friendly olive-green turtle, round pale-green head and limbs, ochre-yellow domed shell with large simple hexagonal plates; no clothing, never a tortoise person.",
    coverPrompt: "熊猫乐乐和小乌龟慢慢在浅浅溪边的岸上一起看一只稳稳漂浮的宽叶小船，小船载着一颗松果，夏日金绿森林。",
    story: [
      ["乐乐想把松果送到小溪对岸。他和慢慢坐在岸上，准备做一只叶子船。", "Panda and tiny turtle sit safely on dry bank of narrow shallow woodland stream with a pinecone and several fallen leaves."],
      ["乐乐动作快，很快就找到一片长叶子。慢慢还在一片一片地看。", "Panda enthusiastically holds long narrow leaf; turtle carefully examines broad fallen leaves on moss, contrasting pace."],
      ["“我做好啦！”乐乐把松果放上去，小船一歪，松果滚到了浅水里。", "Close shallow-water scene: narrow leaf boat tilts and pinecone rolls into ankle-shallow water; panda surprised, turtle watches from bank."],
      ["乐乐捞回松果，低下头：“我这么快，还是没做好。”", "Panda kneels safely at bank retrieves pinecone with paw, downcast; turtle sits nearby listening."],
      ["慢慢说：“我走得慢，常常会多看一会儿。我发现，这片叶子更宽。”", "Tiny turtle shows broad curved leaf to panda, detailed soft shell and gentle face, pile of leaves behind."],
      ["他把松果放在叶子中间，轻轻晃了晃。小船没有翻。", "Close tabletop-like moss craft: turtle places pinecone centrally on broad leaf and tests balance, panda observes."],
      ["“你看得真仔细！”乐乐说。慢慢笑了：“你的爪子大，可以帮我扶稳它吗？”", "Panda admires turtle's clever stable boat; turtle asks for help as panda opens large black paws, friendly medium view."],
      ["乐乐扶住船边，慢慢挪动松果。他们把重的那头，放得更正了一点。", "Overhead teamwork: panda's paws steady broad leaf while turtle adjusts one pinecone at center, safe on dry riverbank."],
      ["小船轻轻放进水里，稳稳地漂了起来。他们沿着岸边，一起看它走。", "Wide gentle stream: broad leaf boat with pinecone floats level; panda and turtle follow along dry safe bank."],
      ["一根小树枝挡住了船。乐乐伸出长树枝，轻轻把它拨开。", "Panda uses a long fallen twig to gently free leaf boat from a small branch in shallow water; turtle beside him."],
      ["小船到了对岸的沙地。“你的力气也很有用！”慢慢说，乐乐笑起来。", "Leaf boat reaches sandy opposite bank of very narrow stream; panda and turtle smile together on near bank, pinecone safe."],
      ["一快一慢的两位朋友，又坐回树荫下。这一次，他们都看见了对方的长处。", "Final calm two-shot under tree: large panda and tiny turtle sit side by side, spare broad leaves and pinecone nearby, golden-green forest."]
    ]
  },
  {
    slug: "lele-owl", title: "猫头鹰想静一静", theme: "尊重独处与安静的需要", companion: "小猫头鹰咕咕",
    companionDescription: "小小的栗棕色猫头鹰，圆圆的奶油色面盘，大眼睛，橙赭色小喙和脚，系浅蓝色小围巾。",
    characterPrompt: "Gugu: small chestnut-brown owl, round cream facial disc, large expressive eyes, tiny ochre-orange beak and feet, pale-blue short scarf; wings remain wings, no human arms.",
    coverPrompt: "熊猫乐乐与小猫头鹰咕咕安静坐在低低的树根和树枝旁，一只装野果的小篮子放在中间，薄雾柔光森林。",
    story: [
      ["乐乐捡到几颗甜甜的野果，想和咕咕一起吃。咕咕刚从树洞里出来。", "Mist-soft woodland morning: panda brings tiny berry basket to low tree hollow where small owl emerges looking sleepy."],
      ["“我们去唱歌吧！”乐乐说。咕咕揉揉眼睛：“我今天想安静一点。”", "Panda excitedly invites owl, open paws; owl gently touches face with wing, sleepy cream facial disc, low branch."],
      ["“那玩捉迷藏呢？”乐乐又问。咕咕摇摇头，把翅膀抱在身前。", "Panda offers another activity, hopeful expression; owl shakes head, folded wings, quiet tree roots."],
      ["乐乐的笑容慢慢收起来：“你是不是不想和我做朋友了？”", "Close panda's worried face looking toward calm owl, berry basket at feet, subdued forest colors."],
      ["咕咕飞到低低的树枝上：“我很喜欢你。可是我的耳朵和脑袋，现在都想歇一歇。”", "Owl on low branch at panda's eye level explaining gently, pale-blue scarf visible; panda listens, no dramatic flight."],
      ["乐乐想起自己累的时候，也不想一直说话。他点点头：“我明白了。”", "Panda sits on soft root thinking with paw at cheek, owl relaxed on nearby low branch, gentle understanding."],
      ["“你想自己待一会儿，还是我安静地陪你？”乐乐问。", "Panda calmly offers choices with open palm; owl looks at him from low branch, quiet leafy enclosure."],
      ["咕咕想了想：“你在旁边就很好。我们可以先不说话吗？”", "Owl gestures gently toward root beside low branch, inviting quiet company; panda nods softly."],
      ["乐乐把野果篮放好，坐在树根上。咕咕轻轻闭上眼睛。", "Wide quiet composition: panda rests on mossy root below sleeping owl on safe low branch, berry basket between them."],
      ["风吹动叶子，小溪轻轻响。没有说话的两位朋友，也没有觉得孤单。", "Peaceful wide forest: still panda and resting owl framed by softly moving leaves and distant shallow brook, no other animals."],
      ["过了一会儿，咕咕睁开眼：“现在，我想吃一颗野果。”乐乐笑着把篮子递过去。", "Owl opens eyes and accepts berry basket offered by panda, warm close scene, calm refreshed expressions."],
      ["他们慢慢吃野果。乐乐知道了：朋友想静一静，友谊也可以好好待在那里。", "Final serene pair share berries quietly at low tree root and branch, mist clearing into soft gold light."]
    ]
  },
  {
    slug: "lele-beaver", title: "河狸的小桥", theme: "合作与共同解决问题", companion: "小河狸木木",
    companionDescription: "栗棕色小河狸，奶油色口鼻，两颗小门牙，宽宽的扁平深棕色尾巴，穿靛蓝色小围裙。",
    characterPrompt: "Mumu: small chestnut-brown beaver, cream muzzle, two small front teeth, wide flat dark-brown paddle tail, indigo-blue short apron; not a squirrel, no fluffy tail.",
    coverPrompt: "熊猫乐乐和小河狸木木在森林细小溪沟旁，一起扶着刚搭好的低低木桥，轻松微笑，苔藓与蕨草环绕。",
    story: [
      ["雨后的小水沟，把森林小路分成了两段。木木想搭一座低低的小桥。", "Wide rainy-fresh forest path split by a tiny shallow ditch, beaver studies two dry banks while panda approaches, fallen sticks nearby."],
      ["乐乐搬来一根粗树枝：“用这个，结实！”木木皱眉：“可是它放不平。”", "Panda proudly holds thick crooked branch; beaver points at uneven ends, muddy shallow ditch, no dangerous river."],
      ["木木挑了几根细树枝：“这些更整齐。”乐乐试着一碰，它们就滚开了。", "Beaver lines several thin smooth sticks across tiny ditch; panda gently tests one and sticks roll apart, mild surprise."],
      ["“还是用我的吧！”他们同时说。小桥没搭好，声音倒越来越大了。", "Panda and beaver face each other with stubborn but non-threatening expressions, separate piles of thick and thin sticks."],
      ["乐乐放下树枝：“我们先停一停。我想要一座结实的桥。”", "Panda lowers crooked branch and takes calm pause, open paw, beaver watching attentively, fern background."],
      ["“我想要一座平平的桥。”木木说。乐乐看看两堆树枝：“能不能都用上？”", "Beaver indicates flat surface with paws; panda considers both wood piles, idea forming, medium eye-level."],
      ["木木的尾巴轻轻一拍：“粗的放下面，细的铺上面！”", "Beaver excitedly lays thick supporting branch below and points to smaller top planks; flat paddle tail clearly visible."],
      ["乐乐搬好两根粗树枝，木木把它们摆稳。他们一边放，一边问对方：“这样好吗？”", "Overhead teamwork: panda carries two sturdy support branches across tiny ditch; beaver carefully stabilizes them on banks."],
      ["细树枝排上去了。木木扶着，乐乐用长草绳，把它们一根一根绑紧。", "Close craft action: beaver steadies thin wooden slats while panda ties them with long woven grass cords, safe low bridge."],
      ["他们先放上一块小石头，又轻轻按了按。小桥稳稳的，没有摇。", "Pair test finished very low bridge with a small stone and gentle paw press, dry moss banks visible."],
      ["木木先走过去，乐乐再慢慢走。两位朋友都到了对面。", "Wide small forest path bridge: beaver waits on far bank while panda steps carefully across tiny shallow ditch."],
      ["“结实，又平平的！”他们笑着碰了碰爪子。小桥上，有两位朋友的好办法。", "Final panda and beaver gently touch paws beside complete low mossy wooden bridge in sunlit forest after rain."]
    ]
  },
  {
    slug: "lele-badger", title: "小獾勇敢说不", theme: "表达拒绝与尊重选择", companion: "小獾阿斑",
    companionDescription: "矮矮的灰棕色小獾，白色头部上有两道长黑条纹，短尾巴，戴赭橙色小挎包。",
    characterPrompt: "Aban: small stocky gray-brown badger, cream head with TWO long BLACK stripes running from nose past eyes toward ears, short tail, tiny ochre-orange crossbody satchel; elongated muzzle, not a raccoon or panda.",
    coverPrompt: "熊猫乐乐和小獾阿斑在森林小路上面向彼此，阿斑温和举爪表达想法，乐乐认真倾听，旁边放着一把小铲子。",
    story: [
      ["乐乐想在树根旁种一株小花。阿斑带着自己的小铲子，正要去整理菜地。", "Panda with small flower seedling on forest path meets badger carrying a little wooden trowel, low tree roots and garden patch."],
      ["“你的铲子借我用吧！”乐乐伸出爪子。阿斑捏紧了铲柄，没有马上回答。", "Panda asks with outstretched open paw; badger holds wooden trowel close, hesitant, medium forest two-shot."],
      ["菜地还没整理好，阿斑想先用自己的铲子。可“不愿意”三个字，卡在嘴边。", "Close badger looking between trowel and unfinished little vegetable patch, conflicted expression; panda waits."],
      ["“就用一下嘛。”乐乐又说。阿斑后退半步，鼻尖都有些紧张了。", "Panda gently repeats request without grabbing; badger steps half a pace back with anxious muzzle, satchel visible."],
      ["阿斑深深吸了一口气：“我现在不想借。我还要用它整理菜地。”", "Badger calmly raises one small paw while holding trowel with other, stating boundary; panda attentive, no anger."],
      ["乐乐的爪子慢慢放下：“好，我听见了。刚才我一直催你，对不起。”", "Panda lowers outstretched paw and apologizes warmly; badger's shoulders begin to relax beside garden."],
      ["阿斑眨眨眼：“你不会生气吗？”乐乐摇摇头：“你可以自己决定。”", "Intimate relieved conversation: badger looks uncertain then hopeful, panda nods respecting choice, leafy forest light."],
      ["乐乐找来一根圆圆的树枝，试着松土。阿斑用铲子，整理自己的小菜地。", "Wide parallel activity: panda loosens soil with rounded stick for flower; badger works own vegetable patch with trowel."],
      ["一块石头有点重。阿斑问：“乐乐，你愿意帮我搬一下吗？”", "Badger pauses beside modest garden stone and asks panda with an open paw; panda turns calmly from flower plot."],
      ["乐乐想了想：“我先种好小花，再来，好吗？”阿斑说：“好，我等你。”", "Panda gently gestures to almost-planted seedling; badger accepts and rests trowel, mutual respect, no pressure."],
      ["小花种好了。他们一起搬开石头，给菜地留出一条窄窄的小路。", "Panda and badger cooperatively move small rounded stone aside, planted flower and tidy tiny garden visible."],
      ["阿斑笑着说：“说不以后，我们还是朋友。”乐乐点点头，把小路踩得平平的。", "Final pair smiling beside tiny flower and vegetable garden with neat stepping path, trowel belongs safely to badger."]
    ]
  },
  {
    slug: "lele-bird", title: "小鸟的新朋友", theme: "接纳新朋友与体贴交流", companion: "小鸟啾啾",
    companionDescription: "小小的青蓝色圆身小鸟，奶油色胸口，赭橙色翅膀，短短的黄色小喙，不穿衣服。",
    characterPrompt: "Jiujiu: tiny round teal-blue songbird, cream chest, ochre-orange wings, short yellow beak, small dark feet; no clothing, no head crest, wings remain wings.",
    coverPrompt: "熊猫乐乐轻轻蹲在低低树枝旁，与青蓝色小鸟啾啾对望，旁边是一朵淡黄色小花和安静的树洞，明亮春日森林。",
    story: [
      ["森林里新来了一只小鸟，叫啾啾。她停在低低的树枝上，望着陌生的小路。", "Tiny teal-blue bird with ochre wings alone on low branch surveying unfamiliar spring forest path, small tree hollow nearby."],
      ["乐乐跑过去：“你好！我叫乐乐！”啾啾吓了一跳，往树叶后面躲。", "Panda approaches cheerfully waving, little bird startled hiding partly behind large leaf on low branch, no extra animals."],
      ["乐乐停住了。他把声音放轻：“对不起，我刚才太大声了。”", "Panda stops a respectful distance from branch and speaks softly, lowered paw; bird peeks out behind leaf."],
      ["“我还不太认识这里。”啾啾小声说。乐乐蹲下来，和她看着一样高的地方。", "Panda crouches gently at low branch height, bird timid but beginning to speak, intimate welcoming two-shot."],
      ["“你想先看看小路，还是在树上歇一会儿？”乐乐问。啾啾说：“先歇一会儿吧。”", "Panda offers choices with calm open paw, bird relaxes on branch and chooses rest, soft spring forest setting."],
      ["乐乐坐在旁边，留出一点空位。啾啾慢慢从叶子后面挪了出来。", "Wide gentle space: panda sits a short respectful distance away; tiny bird emerges onto open part of low branch."],
      ["过了一会儿，啾啾问：“这里有能躲雨的树洞吗？”乐乐指向一棵大树。", "Bird tilts head asking; panda points toward safe hollow in nearby broad tree, sunlight on moss."],
      ["他们一起去看树洞。乐乐走在路上，啾啾沿着低低的树枝，飞一小段，停一小段。", "Side view shared journey: panda walks below while tiny bird makes short hops among low branches toward tree hollow."],
      ["树洞边开着小黄花。“我喜欢这朵花。”啾啾说。乐乐笑了：“我也喜欢！”", "Pair look together at one pale-yellow flower next to hollow tree entrance, panda kneeling and bird on root."],
      ["啾啾轻轻唱了两声。乐乐用爪子打拍子，慢慢跟着她的节奏。", "Small bird sings softly on root while panda gently pats knees keeping relaxed rhythm, no musical symbols or text."],
      ["“明天你还会来吗？”啾啾问。“会呀，明天下午再一起看花，好吗？”乐乐说。啾啾点点头。", "Warm close friends at low branch, bird tilts toward panda asking to meet again, delicate yellow flowers nearby."],
      ["夕阳落在新家的树洞上。陌生的小路，已经连着一位愿意慢慢认识她的朋友。", "Final wide sunset forest: tiny bird content beside new hollow home while panda waves nearby, path connects them, peaceful welcoming scene."]
    ]
  }
];
