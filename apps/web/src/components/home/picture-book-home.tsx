import Link from "next/link";
import { ArrowRight, ArrowUpRight, AudioLines, BookOpen, Download, GraduationCap, Heart, Headphones, Quote, School, Sparkles, Upload, Users } from "lucide-react";
import { StoryIdeaForm } from "./story-idea-form";
import { pictureBookLibraryHref, recommendedPictureBooks } from "./recommended-picture-books";
import styles from "./picture-book-home.module.css";

const testimonials = [
  { role: "家长", icon: Heart, headline: "孩子成了故事里的主角", quote: "把孩子的小小想法写进绘本，再一起听、一起读。睡前的这段时间，成了我们每天最期待的时刻。", context: "亲子共读 · 睡前陪伴" },
  { role: "老师", icon: GraduationCap, headline: "让阅读从听故事开始", quote: "把课堂主题变成孩子喜欢的故事，配上画面和声音。读完再聊一聊，孩子们更愿意说出自己的想法。", context: "绘本教学 · 课堂互动" },
  { role: "培训机构", icon: Users, headline: "每一节课都有自己的故事", quote: "围绕课程制作绘本和导读，把故事延伸到课后的家庭阅读。老师备课有了素材，家长也更容易参与。", context: "课程创作 · 家校延伸" },
  { role: "学校", icon: School, headline: "把孩子的创作留下来", quote: "从一个想法到一本有声绘本，让阅读和表达连在一起。我们希望每个孩子都能拥有自己的作品。", context: "校园阅读 · 学生创作" }
];

export function PictureBookHome() {
  return (
    <div className={styles.home}>
      <section className={styles.hero} id="create" aria-labelledby="create-title">
        <div className={styles.container}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span />小小的想法，大大的故事</p>
              <h1 id="create-title">把一个想法，<br />变成<span>有声绘本</span></h1>
              <p className={styles.heroDescription}>让想象有画面，让故事有声音。<br />为孩子，也为心里的那个小孩。</p>
              <StoryIdeaForm />
            </div>
            <div className={styles.heroArt}>
              <div className={styles.artBackdrop} />
              <img className={styles.backBook} src="/picture-book-demos/lele-hedgehog/cover.webp" alt="小刺猬的拥抱绘本封面" width={360} height={360} />
              <img className={styles.frontBook} src="/picture-book-demos/lele-rabbit/cover.webp" alt="等等我，小兔绘本封面，熊猫乐乐和小兔在森林中相伴" width={440} height={440} fetchPriority="high" />
              <div className={styles.soundLabel}><span className={styles.soundIcon}><AudioLines size={24} /></span><div><strong>每个故事，都能听见</strong><span>画面与声音，一起陪伴</span></div><div className={styles.waveform} aria-hidden="true">{[12, 22, 32, 18, 27, 14, 23].map((height, index) => <i key={index} style={{ height }} />)}</div></div>
              <span className={styles.artNote}>翻开想象的第一页</span>
              <Sparkles className={styles.artSparkle} size={32} strokeWidth={1.2} aria-hidden="true" />
            </div>
          </div>
          <div className={styles.heroFoot}><span><BookOpen size={17} />把想法画成故事</span><span><Headphones size={17} />用声音温暖陪伴</span><span><Heart size={17} />让阅读成为日常</span><a href="#library">先找一本喜欢的绘本<ArrowRight size={16} /></a></div>
        </div>
      </section>

      <section className={`${styles.library} ${styles.container}`} id="library" aria-labelledby="library-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>线上绘本馆</p><h2 id="library-title"><span>2,000+</span> 本绘本，读不完的好故事</h2></div><a className={styles.textLink} href={pictureBookLibraryHref}>进入绘本馆<ArrowUpRight size={19} /></a></div>
        <div className={styles.libraryDetails}><p>看绘本、听故事，也可以下载收藏。</p><div><span><BookOpen size={16} />在线看</span><span><Headphones size={16} />随时听</span><span><Download size={16} />下载读</span></div></div>
        <div className={styles.shelfHeading}><h3>为你推荐</h3><span>20 本，开启今天的阅读</span></div>
        <div className={styles.bookGrid}>
          {recommendedPictureBooks.map((book) => (
            <a className={styles.bookCard} href={book.href} key={book.id} aria-label={`阅读《${book.title}》`}>
              <div className={styles.bookCover}><img src={book.cover} alt={`${book.title}绘本封面`} width={320} height={320} loading="lazy" /><span className={styles.readOverlay}><BookOpen size={19} />开始阅读</span></div>
              <div className={styles.bookTitle}><h4>{book.title}</h4><ArrowUpRight size={17} aria-hidden="true" /></div>
              <span className={styles.bookMeta}><AudioLines size={13} />有声绘本</span>
            </a>
          ))}
        </div>
        <div className={styles.libraryBottom}><span>下一本喜欢的故事，就在这里。</span><a href={pictureBookLibraryHref}>发现更多绘本<ArrowRight size={17} /></a></div>
      </section>

      <section className={styles.guideSection} id="guide" aria-labelledby="guide-title">
        <div className={styles.container}><div className={styles.guide}>
          <div className={styles.guideVisual}>
            <div className={styles.guidePage}><img src="/picture-book-demos/lele-bear/04.webp" alt="熊猫乐乐和小熊一起阅读分享的故事" width={370} height={370} loading="lazy" /><div><AudioLines size={20} /><span>一起读，聊一聊</span><span className={styles.guideDots} aria-hidden="true">···</span></div></div>
            <div className={styles.guidePrompt}><Sparkles size={17} /><span>如果是你，会怎么做？</span></div>
            <span className={styles.guideTag}><Upload size={16} />上传你的绘本素材</span>
          </div>
          <div className={styles.guideCopy}><p className={styles.eyebrow}>绘本导读</p><h2 id="guide-title">好故事，<br />值得再聊一聊。</h2><p>上传绘本素材，制作专属绘本导读。<br />从听懂故事，到读出自己的想法。</p><Link className={styles.primaryLink} href="/magic-reader">制作绘本导读<ArrowUpRight size={19} /></Link></div>
        </div></div>
      </section>

      <section className={`${styles.testimonials} ${styles.container}`} id="voices" aria-labelledby="voices-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>客户感言</p><h2 id="voices-title">不同的身份，同样的陪伴。</h2></div><span className={styles.sampleLabel}>示例感言 · 待真实反馈替换</span></div>
        <div className={styles.testimonialGrid}>{testimonials.map((item) => { const Icon = item.icon; return <figure className={styles.testimonial} key={item.role}><div className={styles.testimonialTop}><span><Icon size={17} />{item.role}</span><Quote size={27} strokeWidth={1.1} aria-hidden="true" /></div><h3>{item.headline}</h3><blockquote>{item.quote}</blockquote><figcaption>{item.context}</figcaption></figure>; })}</div>
      </section>

      <section className={styles.closing}><div className={styles.container}><BookOpen size={34} strokeWidth={1.3} aria-hidden="true" /><h2>今天，想给孩子讲个什么故事？</h2><a href="#create">从一个想法开始<ArrowUpRight size={18} /></a></div></section>
    </div>
  );
}
