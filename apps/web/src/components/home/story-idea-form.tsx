"use client";

import { useState } from "react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { encodeStoryIdea, STORY_IDEA_MAX_LENGTH } from "@/lib/storybook-idea";
import styles from "./picture-book-home.module.css";

const ideas = [
  { label: "睡前故事", prompt: "给 5 岁的孩子创作一本温暖的睡前绘本，讲一只小熊收集星星、学会安心入睡的故事。" },
  { label: "情绪成长", prompt: "创作一本适合幼儿园孩子的有声绘本，讲小兔子学会表达生气、和朋友一起解决问题的故事。" },
  { label: "奇妙冒险", prompt: "创作一本有声绘本，让一个勇敢的小女孩和她的小狗坐着纸飞机去月亮探险，画面充满想象力。" }
];

export function StoryIdeaForm() {
  const [idea, setIdea] = useState("");

  return (
    <div className={styles.ideaBlock}>
      <form action="/storybook" method="get" className={styles.ideaForm} onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("story-idea") as HTMLTextAreaElement;
        if (idea.trim().length < 2) {
          event.preventDefault();
          input.setCustomValidity("请写下至少两个字的创作要求");
          input.reportValidity();
        }
      }}>
        <input type="hidden" name="idea" value={encodeStoryIdea(idea)} />
        <label htmlFor="story-idea" className={styles.inputLabel}><Sparkles size={16} />你想讲一个什么故事？</label>
        <textarea id="story-idea" rows={3} required minLength={2} maxLength={STORY_IDEA_MAX_LENGTH}
          placeholder="比如：给 5 岁的女儿讲一个小兔子学会勇敢的故事，温暖的水彩风格……"
          value={idea} onChange={(event) => { event.currentTarget.setCustomValidity(""); setIdea(event.target.value); }} />
        <div className={styles.formBottom}><span>{idea.length} / {STORY_IDEA_MAX_LENGTH} 字</span><button type="submit">开始创作<ArrowUpRight size={19} /></button></div>
      </form>
      <div className={styles.ideaSuggestions}><span>试试这些灵感</span>{ideas.map((item) => <button type="button" key={item.label} onClick={() => { setIdea(item.prompt); const input = document.getElementById("story-idea") as HTMLTextAreaElement; input.setCustomValidity(""); input.focus(); }}>{item.label}<ArrowUpRight size={13} /></button>)}</div>
    </div>
  );
}
