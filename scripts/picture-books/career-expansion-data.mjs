import {careerSeriesBooks} from './career-series-data.mjs';
import {careerExpansionA} from './career-expansion-a.mjs';
import {careerExpansionB} from './career-expansion-b.mjs';
import {careerExpansionC} from './career-expansion-c.mjs';

export const careerAdditionalBooks=[...careerExpansionA,...careerExpansionB,...careerExpansionC];
export const careerCollectionBooks=[...careerSeriesBooks,...careerAdditionalBooks];
export const careerExpandedDescription='16个孩子，16个不同的职业理想。从医生、消防员、老师，到护士、警察、厨师、公交车司机、地铁司机、快递员、环卫工人、建筑师、工程师、科学家、飞行员、园艺师和兽医，孩子们在爸爸、妈妈或双亲的陪伴下，认识中国城市里的工作，学习细心、合作与关心。每本独立成篇，16页正文加带书名的封面，3:4竖版，面向幼儿园小朋友。';
