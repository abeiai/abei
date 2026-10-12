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
  const review={scope:'COURSE_REVISION',courseRevision:{id:'revision-a',name:'草稿B',items:[{id:'member-a',publicationId:'pub-a',materialType:'PICTURE_BOOK',displayName:'成员',pinnedVersion:1,pinnedSnapshot:{pages:[{position:0,caption:'草稿B'}]}}]},afterSnapshot:{name:'投稿A',summary:'简介A',items:[{publicationId:'pub-a',materialSnapshot:{pages:[{position:0,caption:'封面A',narration:'旁白A',audioUrl:'private-raw-audio',translations:[{language:'en',caption:'Frozen A',audioUrl:'private-english'}]}]}}]}} as unknown as CourseReviewRequest;
  const html=renderToStaticMarkup(createElement(FrozenAlbumPreview,{review}));
  for(const text of ['投稿A','简介A','封面A','旁白A','Frozen A','/api/creator-media/revisions/revision-a/cover','/api/creator-media/items/member-a/pages/0/image','/api/creator-media/items/member-a/pages/0/audio?language=en']) assert.ok(html.includes(text));
  assert.doesNotMatch(html,/草稿B|private-raw-audio|private-english/);
});
