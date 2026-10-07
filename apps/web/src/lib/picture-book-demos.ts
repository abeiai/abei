type StoryPage = readonly [caption: string, imagePrompt: string];
type DemoStory = { slug: string; title: string; theme: string; companion: string; coverPrompt: string; story: readonly StoryPage[] };

const stories: DemoStory[] = [
  {
    slug: "lele-rabbit", title: "等等我，小兔", theme: "照顾彼此的节奏", companion: "小兔米米",
    coverPrompt: "熊猫乐乐与穿青蓝色背带裤的小白兔米米并肩走在金色阳光下的森林小路上，相视微笑，路旁有蕨草和白色雏菊。封面上方清晰写出书名“等等我，小兔”，书名上方用较小文字写“熊猫乐乐的森林朋友”。",
    story: [
      ["森林里的早晨，阳光一格一格落在小路上。熊猫乐乐遇见了小兔米米。", "Morning establishing scene: Lele the panda stands on a dappled forest path greeting Mimi the white rabbit in teal overalls, sunlight pools on moss and daisies, both wave, full bodies."],
      ["‘山坡上的花开啦！’米米蹦了两下，‘我们一起去看吧！’乐乐高兴地点点头。", "Mimi excitedly points up at a distant flower-covered hill visible between teal trunks; Lele smiles and nods beside her, joyful invitation, wide forest composition."],
      ["米米蹦呀蹦，一会儿就跑到了前面。乐乐迈着大步，肚子却晃得有些累。", "Mimi bounds energetically far ahead up a winding woodland path on the upper right; Lele trudges behind lower left with a tired expression, visibly separated by several steps, gentle comic motion."],
      ["‘等等我，小兔！’乐乐喊。米米回过头：‘快一点，就快到啦！’", "Lele stops at a tree and raises a black paw to call out, panting gently; far up the path Mimi turns her head to look back, puzzled, medium-wide scene emphasizing distance."],
      ["米米跑到一片花丛前，发现身边空空的。漂亮的花，也少了一起看的朋友。", "Mimi alone beside a small bank of white daisies and ochre flowers pauses, ears lower and face looks lonely, empty space beside her. Panda is out of view. Forest flower detail close scene."],
      ["她跑回去。乐乐坐在树根旁，小声说：‘我也想去，可我走不了那么快。’", "Mimi has returned and stands listening to Lele sitting tired on a mossy tree root, panda holds one paw on belly, tender candid conversation, mid-shot warm forest shade."],
      ["米米的耳朵垂下来。‘对不起，我只顾着自己跑了。你想怎么走呢？’", "Close two-character emotional scene: Mimi lowers her ears and gently asks seated Lele a question; Lele looks back with relief, eye-level intimate composition, fern-filled woodland."],
      ["‘走一会儿，歇一会儿，好吗？’乐乐说。米米点点头：‘我们一起走。’", "Lele rises from the tree root and gestures with an open black paw toward the path, Mimi nods warmly beside him; they agree to a comfortable shared pace, medium scene."],
      ["慢下来以后，他们看见了弯弯的树根，还发现一朵躲在叶子下面的小花。", "Both Lele and Mimi crouch together studying a single tiny white flower tucked under a large green leaf beside curving exposed tree roots, low viewpoint intimate discovery scene."],
      ["歇脚时，乐乐指着树影说：‘像一条大鱼！’米米笑了：‘还像我的长耳朵！’", "Lele and Mimi sit resting side by side on a mossy log, laughing and pointing at abstract dappled leaf shadows shaped like a long fish and ears on the path, overhead-diagonal playful composition, no real fish."],
      ["他们终于走上山坡。花海在风里轻轻摇，两位朋友肩挨着肩，笑得一样开心。", "Lele and Mimi stand side by side on top of a hill looking across a broad sea of spring daisies, teal forest stretching beyond, breeze bends flowers, wide joyful destination scene from slight rear three-quarter angle."],
      ["回家时，米米问：‘明天还一起走吗？’乐乐笑了：‘好呀，按我们俩的步子走。’", "Golden late-afternoon finale: Lele and Mimi walk home side by side at an easy pace along the forest path, looking at each other smiling, long gentle shadows, rust scarf and teal overalls consistent, warm wide scene."]
    ]
  },
  {
    slug: "lele-hedgehog", title: "小刺猬的拥抱", theme: "尊重边界，表达关心", companion: "小刺猬球球",
    coverPrompt: "熊猫乐乐与小刺猬球球坐在森林的苔藓树桩两侧，一起举起小爪子互相挥手，金色树叶飘落，温暖而亲密。封面上方清晰写出书名“小刺猬的拥抱”，书名上方用较小文字写“熊猫乐乐的森林朋友”。",
    story: [
      ["风把金色的叶子吹进森林。熊猫乐乐在树下，遇见了小刺猬球球。", "Autumn establishing scene: Lele waves hello to Qiuqiu the small cinnamon-spined hedgehog under a tall teal tree, drifting gold leaves, both full bodies, warm ochre forest palette."],
      ["球球捧来一片心形叶子。‘送给你。’乐乐接过来：‘我好喜欢！’", "Qiuqiu offers one big heart-shaped golden leaf in his tiny paws to delighted Lele who gently receives it, eye-level medium composition, textured autumn woodland."],
      ["乐乐张开手臂，想给球球一个大大的拥抱。球球却往后退了一小步。", "Lele opens both black arms excitedly to offer a hug; Qiuqiu takes one step back with a startled expression and slightly tense cinnamon spines, clear space between them, no contact."],
      ["‘先别抱，好吗？’球球轻声说。乐乐的手停在半空，笑容慢慢收了起来。", "Qiuqiu holds up one tiny paw asking for a pause, Lele stops with arms half-raised and puzzled face, gentle emotional medium shot, leaf-strewn forest floor."],
      ["乐乐低下头：‘你是不是不想和我做朋友？’球球赶紧摇摇头。", "Lele sits with drooping shoulders, looking sadly at Qiuqiu; the hedgehog leans forward shaking his head with a concerned kind expression, intimate forest conversation."],
      ["‘我很想呀！可我有尖尖的刺，突然抱过来，我会紧张，也怕扎疼你。’", "Qiuqiu gently points at his own cinnamon spines while explaining, Lele listens with head tilted and softened face; close scene with clearly visible hedgehog spines, warm soft sunlight."],
      ["乐乐把手放下来。‘原来是这样。那我怎么做，你会觉得舒服呢？’", "Lele rests both black paws relaxed on his knees and asks Qiuqiu kindly, hedgehog posture relaxes too, equal eye-level listening scene near mossy roots."],
      ["球球想了想，举起小爪子：‘可以先挥挥手，再坐在我旁边。’", "Qiuqiu demonstrates a small friendly wave with a tiny paw and indicates an empty spot on a mossy log beside him; Lele smiles as he watches, medium forest scene."],
      ["乐乐也挥挥手。他们隔着一点空隙坐好，一起听风吹过树梢。", "Lele and Qiuqiu sit comfortably on a mossy log with a small respectful gap, both waving and smiling, golden leaves swirl in breeze above tall teal trunks, wide tranquil scene."],
      ["一阵风卷走了心形叶子。乐乐捡回来，问：‘可以放在你的爪子里吗？’", "Lele kneels holding the recovered heart-shaped golden leaf in an open black paw near Qiuqiu but waits for permission, hedgehog looks at the leaf happily, wind-swept autumn clearing."],
      ["‘可以呀！’球球笑着接住叶子。他们把叶子夹进树洞里的小画册。", "Lele and Qiuqiu carefully tuck the heart-shaped golden leaf between the blank pages of a little cream paper sketchbook in a low tree hollow, teamwork, close scene, absolutely no words on sketchbook."],
      ["告别时，两只小爪子在空中挥了挥。没有大拥抱，乐乐心里也暖暖的。", "Golden twilight forest farewell: Lele and Qiuqiu face each other waving warmly from a comfortable distance, heart-shaped leaf visible in open little blank sketchbook in the tree hollow behind, wide tender concluding scene."]
    ]
  },
  {
    slug: "lele-squirrel", title: "松鼠的橡果约定", theme: "遵守约定，修复信任", companion: "松鼠松果",
    coverPrompt: "熊猫乐乐与背着鼠尾草绿色小挎包的橙红色松鼠松果，在森林橡树下各自捧着一颗橡果，脚边是装着橡果的小藤篮。封面上方清晰写出书名“松鼠的橡果约定”，书名上方用较小文字写“熊猫乐乐的森林朋友”。",
    story: [
      ["森林的橡树下，松鼠松果捡了一篮子橡果。熊猫乐乐走过来：‘需要帮忙吗？’", "Lele approaches Songguo the rusty orange squirrel with a sage green satchel under an oak tree. Songguo has a small wicker basket full of acorns at his feet, autumn-green forest, friendly establishing scene."],
      ["‘太好啦！请帮我看一会儿。我要去拿大篮子，我们等会儿一起分。’", "Songguo gestures at the little acorn basket while speaking to Lele, then points toward the forest path to fetch a larger basket, panda nods attentively, both characters visible, medium scene."],
      ["乐乐认真点头：‘我会看好它们。’松果背着小挎包，放心地走开了。", "Lele sits beside the small wicker basket full of acorns and gives a reassuring wave. Songguo walks away down a short woodland path with green satchel and curled tail visible, wide scene."],
      ["等待时，乐乐拿起一颗橡果。‘好圆呀，滚起来一定很好玩！’", "Lele alone beside the basket studies one round acorn held between his black paws with curious eyes, mossy oak root nearby, close medium shot, squirrel out of view."],
      ["他把橡果排成小火车。咕噜噜！几颗橡果滚下树根，掉进了枯叶堆。", "Lele alone playing with a row of acorns like a little train on a sloping tree root; several acorns tumble down into a deep pile of dry leaves, panda suddenly alarmed, dynamic low-angle composition, no actual toy train."],
      ["松果回来了。‘咦，怎么少了？’乐乐抱住篮子，小声说：‘我只是玩了一下……’", "Songguo returns carrying a larger empty wicker basket and looks surprised at the missing acorns. Lele holds the smaller basket and looks embarrassed with shoulders drawn in, clear storytelling medium shot."],
      ["松果的尾巴垂下来：‘我有点生气。这些是我捡了很久才攒好的。’", "Songguo stands with lowered fluffy tail and disappointed serious face, paws on the nearly empty small basket; Lele looks at him listening, intimate emotional scene without aggression."],
      ["乐乐放下篮子。‘对不起，我没守住约定，还没先问你。我去把橡果找回来。’", "Lele puts down the small basket, gently speaks with sincere regret and points toward the fallen leaves; Songguo listens, medium eye-level apology scene at oak roots."],
      ["乐乐蹲下来，一片一片拨开枯叶。松果站在旁边，过了一会儿，也蹲了下来。", "Lele carefully searches on his knees turning over autumn leaves one at a time; Songguo initially nearby now crouches to help search, baskets to side, overhead diagonal view emphasizing gentle action."],
      ["他们找齐了滚走的橡果。乐乐把它们放进篮子：‘下次动你的东西，我会先问。’", "Lele and Songguo return recovered acorns to the wicker basket, all acorns found, panda's open paw indicates renewed promise, squirrel expression begins to soften, medium hopeful forest scene."],
      ["松果摸摸篮子，点点头：‘我还需要缓一缓。你愿意陪我把它们搬回家吗？’", "Songguo rests a paw on the refilled basket, calm but thoughtful rather than instantly exuberant, looks up asking Lele to carry it together; panda nods, warm medium composition."],
      ["‘愿意！’他们各扶住篮子的一边，慢慢走。明天的约定，乐乐也会好好放在心里。", "Finale: Lele and Songguo carry the same small full acorn basket together, each holds one side, walking along a golden forest path toward a low oak tree hollow, warm cautious smiles and restored cooperation, wide sunset scene."]
    ]
  }
];

export const pictureBookDemos = stories.map(({ story, ...book }) => ({
  ...book, id: `demo-${book.slug}`, series: "熊猫乐乐的森林朋友", audience: "4–7岁", style: "森林肌理插画", aspectRatio: "1:1", pageCount: 12,
  coverUrl: `/picture-book-demos/${book.slug}/cover.webp?v=title-v1`,
  pages: story.map(([caption, imagePrompt], index) => ({
    position: index + 1, caption, narration: caption, imagePrompt,
    imageUrl: `/picture-book-demos/${book.slug}/${String(index + 1).padStart(2, "0")}.webp`, audioUrl: null
  }))
}));

export type PictureBookDemo = typeof pictureBookDemos[number];
