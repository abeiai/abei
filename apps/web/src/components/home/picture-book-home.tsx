import Link from "next/link";
import { ArrowRight, ArrowUpRight, AudioLines, BookOpen, Cloud, Download, Flower2, Headphones, Sparkles, Star, Sun, Upload } from "lucide-react";
import { StoryIdeaForm } from "./story-idea-form";
import { homepageLibrary, type LibraryAlbum, type LibraryBook } from "@/lib/picture-book-library";
import { PictureBookShelves } from "./picture-book-shelves";
import styles from "./picture-book-home.module.css";

const testimonials = [
  { name: "林女士", role: "家长", avatar: "female-middle", quote: "把孩子的小小想法写进绘本，再一起听、一起读。睡前的这段时间，成了我们每天最期待的时刻。" },
  { name: "陈老师", role: "老师", avatar: "male-young", quote: "把课堂主题变成孩子喜欢的故事，配上画面和声音。读完再聊一聊，孩子们更愿意说出自己的想法。" },
  { name: "许老师", role: "培训机构", avatar: "female-young", quote: "围绕课程制作绘本和导读，把故事延伸到课后的家庭阅读。老师备课有了素材，家长也更容易参与。" },
  { name: "李校长", role: "学校", avatar: "male-middle", quote: "从一个想法到一本有声绘本，让阅读和表达连在一起。我们希望每个孩子都能拥有自己的作品。" }
];

export function PictureBookHome({ albums, books, libraryFailed = false }: { albums: LibraryAlbum[]; books: LibraryBook[]; libraryFailed?: boolean }) {
  const library = homepageLibrary(albums, books);
  return (
    <div className={styles.home}>
      <section className={styles.hero} id="create" aria-labelledby="create-title">
        <div className={styles.heroDoodles} aria-hidden="true"><Cloud /><Star /><Sun /><Flower2 /><Star /></div>
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
              <img className={styles.heroIllustration} src="/home-assets/reading-hero-v2.webp" alt="两个孩子坐在彩色绘本上一起阅读，小熊猫陪在身旁" width={1024} height={1024} fetchPriority="high" />
              <div className={styles.soundLabel}><span className={styles.soundIcon}><AudioLines size={24} /></span><div><strong>每个故事，都能听见</strong><span>画面与声音，一起陪伴</span></div><div className={styles.waveform} aria-hidden="true">{[12, 22, 32, 18, 27, 14, 23].map((height, index) => <i key={index} style={{ height }} />)}</div></div>
              <Sparkles className={styles.artSparkle} size={32} strokeWidth={1.2} aria-hidden="true" />
            </div>
          </div>
        </div>
        <svg className={styles.heroWaves} viewBox="0 0 1600 130" preserveAspectRatio="none" aria-hidden="true"><path fill="#c6ed8e" d="M0 14C380 14 790 125 1160 90S1460 40 1600 70V130H0Z" /><path fill="#74d1ce" d="M0 83C390 148 920 30 1260 35S1490 60 1600 62V130H0Z" /><path fill="#459ebc" d="M0 109C450 165 1000 63 1330 78S1500 98 1600 89V130H0Z" /></svg>
      </section>

      <section className={`${styles.library} ${styles.container}`} id="library" aria-labelledby="library-title">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>线上绘本馆</p><h2 id="library-title">读不完的好故事</h2></div><a className={styles.textLink} href="/library">进入绘本馆<ArrowUpRight size={19} /></a></div>
        <div className={styles.libraryDetails}><p>看绘本、听故事，也可以下载收藏。</p><div><span><BookOpen size={16} />在线看</span><span><Headphones size={16} />随时听</span><span><Download size={16} />下载读</span></div></div>
        {libraryFailed ? <p className="py-4 text-sm text-destructive" role="alert">绘本馆暂时无法加载，请稍后重试。</p> : null}
        <PictureBookShelves albums={library.albums} books={library.books} />
        <div className={styles.libraryBottom}><span>下一本喜欢的故事，就在这里。</span><a href="/library/books">发现更多绘本<ArrowRight size={17} /></a></div>
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
        <div className={styles.testimonialGrid}>
          {testimonials.map((item) => (
            <figure className={styles.testimonial} key={item.role}>
              <div className={styles.testimonialStars} aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={16} fill="currentColor" strokeWidth={0} />)}</div>
              <blockquote>{item.quote}</blockquote>
              <figcaption>
                <img className={styles.testimonialAvatar} src={`/images/voice-avatars/${item.avatar}.jpg`} alt={`${item.name}的示例头像`} width={90} height={90} loading="lazy" />
                <h3>{item.name}<span className={styles.testimonialSample}>（示例）</span></h3>
                <span className={styles.testimonialRole}>{item.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.closing}><div className={styles.container}><BookOpen size={34} strokeWidth={1.3} aria-hidden="true" /><h2>今天，想给孩子讲个什么故事？</h2><a href="#create">从一个想法开始<ArrowUpRight size={18} /></a></div></section>
    </div>
  );
}
