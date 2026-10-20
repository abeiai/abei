import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';
import { FrozenAlbumPreview } from '../src/components/admin/frozen-album-preview.js';
import { ResourceReviewManager } from '../src/components/admin/resource-review-manager.js';
import type { CourseReviewRequest } from '../src/lib/course-types.js';

test('active resource review uses frozen album preview instead of latest draft course link',()=>{
  const review={id:'review-a',affectedCourses:[],scope:'COURSE_REVISION',status:'PENDING',submittedAt:new Date().toISOString(),submittedByUser:{nickname:'作者'},aiPrecheckStatus:'NOT_STARTED',course:{id:'album',approvedRevisionId:'approved-a',publishedAt:'2026-10-12'},courseRevision:{id:'revision-a',name:'待审版本A',items:[{id:'member-a',materialType:'PICTURE_BOOK',pinnedSnapshot:{pages:[{position:0,caption:'冻结内容A',imageUrl:'/private'}]}}]},afterSnapshot:{name:'待审版本A'}} as unknown as CourseReviewRequest;
  const router={refresh(){}} as unknown as NonNullable<Parameters<typeof AppRouterContext.Provider>[0]['value']>;
  const html=renderToStaticMarkup(createElement(AppRouterContext.Provider,{value:router},createElement(ResourceReviewManager,{reviews:[review],filters:{status:"PENDING",scope:""}})));
  assert.doesNotMatch(html,/href="\/c\/album"/);
  assert.match(html,/预览/);
  assert.match(html,/下架已发布专辑/);
});


test('frozen review displays submitted cover text narration and multilingual audio from revision A',()=>{
  const review={scope:'COURSE_REVISION',courseRevision:{id:'revision-a',name:'草稿B',items:[{id:'member-a',publicationId:'pub-a',materialType:'PICTURE_BOOK',displayName:'成员',pinnedVersion:1,pinnedSnapshot:{pages:[{position:0,caption:'草稿B'}]}}]},afterSnapshot:{name:'公开分享A',summary:'简介A',items:[{publicationId:'pub-a',materialSnapshot:{pages:[{position:0,caption:'封面A',narration:'旁白A',audioUrl:'private-raw-audio',translations:[{language:'en',caption:'Frozen A',audioUrl:'private-english'}]}]}}]}} as unknown as CourseReviewRequest;
  const html=renderToStaticMarkup(createElement(FrozenAlbumPreview,{review}));
  for(const text of ['公开分享A','简介A','封面A','旁白A','Frozen A','/api/creator-media/revisions/revision-a/cover','/api/creator-media/items/member-a/pages/0/image','/api/creator-media/items/member-a/pages/0/audio?language=en']) assert.ok(html.includes(text));
  assert.doesNotMatch(html,/草稿B|private-raw-audio|private-english/);
});


test('active album preview retains frozen book inspection and exposes every mixed member', () => {
  const review = {
    id: 'mixed-review', scope: 'COURSE_REVISION', status: 'PENDING', affectedCourses: [],
    submittedAt: '2026-10-12', submittedByUser: { nickname: '作者' }, aiPrecheckStatus: 'NOT_STARTED',
    courseId: 'mixed-album', course: { id: 'mixed-album' },
    courseRevision: { id: 'mixed-revision', name: '混合专辑', items: [
      { id: 'frozen-member', publicationId: 'frozen-publication', materialType: 'PICTURE_BOOK', displayName: '冻结绘本', pinnedVersion: 2, pinnedSnapshot: { pages: [{ position: 1, caption: '冻结正文', audioUrl: '/private/frozen-audio' }] } },
      { id: 'new-book', materialType: 'PICTURE_BOOK', displayName: '新增绘本', pinnedSnapshot: null },
      { id: 'video-member', materialType: 'VIDEO_GUIDE', displayName: '视频课件' },
      { id: 'flashcard-member', materialType: 'LEARNING_FLASHCARD', displayName: '闪卡课件' },
      { id: 'english-member', materialType: 'ENGLISH_GUIDED_STUDY', displayName: '英语课件' }
    ] }, afterSnapshot: { name: '混合专辑' }
  } as unknown as CourseReviewRequest;
  const router = { refresh() {} } as unknown as NonNullable<Parameters<typeof AppRouterContext.Provider>[0]['value']>;
  const manager = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(ResourceReviewManager, { reviews: [review], filters: { status: 'PENDING', scope: '' } })));
  assert.match(manager, /预览公开分享版本/);
  assert.doesNotMatch(manager, /href="\/c\/mixed-album"/);
  // Render the same preview subtree opened by the active manager's preview modal.
  const html = renderToStaticMarkup(createElement(FrozenAlbumPreview, { review }));
  for (const name of ['冻结绘本', '新增绘本', '视频课件', '闪卡课件', '英语课件']) assert.ok(html.includes(name), `missing member: ${name}`);
  for (const name of ['新增绘本', '视频课件', '闪卡课件', '英语课件']) assert.ok(html.includes(`aria-label="${name}：打开专辑预览"`));
  assert.equal((html.match(/href="\/c\/mixed-album"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /aria-label="冻结绘本：打开专辑预览"|\/picture-books\/|\/private\//);
  assert.match(html, /冻结正文/);
  assert.match(html, /\/api\/creator-media\/items\/frozen-member\/pages\/1\/image/);
  assert.match(html, /\/api\/creator-media\/items\/frozen-member\/pages\/1\/audio/);
});
