import test from 'node:test';
import assert from 'node:assert/strict';
import {displayStoryText} from './publication.mjs';

test('公开验收按阅读器规则清除空行并保留其他内容',()=>{
 assert.equal(displayStoryText(' First  \r\n \t\r\nSecond\n\u00a0\nThird\n'),' First  \nSecond\nThird');
 assert.equal(displayStoryText('  \n\t'), '');
 assert.equal(displayStoryText('A\n\u200b\n\u2060\nB\u200bC'), 'A\nB\u200bC');
});
