import unittest
from unittest.mock import patch
import subprocess
import harvest
from harvest import extract_story_pages, choose_object, valid_slug, png_size, blank_page_png, source_text_proof, LEVEL_LABELS

class HarvestTest(unittest.TestCase):
 def test_excludes_non_story_records_and_preserves_box_order(self):
  d={'id':42,'lastPagePosition':3,'language':'English'}
  p=[{'id':i,'story_id':42,'position':i,'illustration_crop_id':i,'content':None,'boxes':[]} for i in range(1,5)]
  p[1]['boxes']=[{'position':2,'content':'<p>Second &amp; next.</p>'},{'position':1,'content':'<p>First<br>line.</p>'}]
  story=extract_story_pages(d,p)
  self.assertEqual([x['position'] for x in story],[1,2,3]);self.assertEqual(story[1]['text'],'First\nline.\nSecond & next.')
 def test_rejects_missing_duplicate_and_wrong_story(self):
  d={'id':42,'lastPagePosition':2,'language':'English'}
  p=[{'story_id':42,'position':1,'illustration_crop_id':1,'boxes':[]},{'story_id':99,'position':2,'illustration_crop_id':2,'boxes':[]}]
  with self.assertRaises(ValueError):extract_story_pages(d,p)
  p[1]['story_id']=42;p[1]['position']=1
  with self.assertRaises(ValueError):extract_story_pages(d,p)
 def test_cover_uses_original_and_other_pages_fall_back_from_tiny_image(self):
  items=[{'name':'illustration_crops/42/page_landscape/a.png','size':'400'},{'name':'illustration_crops/42/original/a.png','size':'4000000'},{'name':'illustration_crops/42/large/a.jpg','size':'200000'}]
  self.assertTrue(choose_object(items,42,True)['name'].endswith('/large/a.jpg'))
  self.assertTrue(choose_object(items,42,False)['name'].endswith('/large/a.jpg'))
 def test_empty_original_uses_large_image(self):
  items=[{'name':'illustration_crops/42/original/a.png','size':'0'},{'name':'illustration_crops/42/large/a.jpg','size':'173703'}]
  self.assertEqual(choose_object(items,42,True)['name'],'illustration_crops/42/large/a.jpg')
 def test_slug_keeps_unicode_but_rejects_paths(self):
  self.assertTrue(valid_slug(26866,'26866-सोंश-याचे-लांब-कान'))
  self.assertFalse(valid_slug(42,'42-../../outside'))
 def test_webp_dimensions_and_text_binding(self):
  webp=b'RIFF'+(22).to_bytes(4,'little')+b'WEBPVP8X'+(10).to_bytes(4,'little')+bytes(4)+(639).to_bytes(3,'little')+(479).to_bytes(3,'little')
  self.assertEqual(png_size(webp),(640,480))
  page={'id':1,'position':1,'content':None,'boxes':[{'position':1,'content':'<p>Hi</p>'}]}
  self.assertNotEqual(source_text_proof(page,'Hi'),source_text_proof(page,'Changed'))
 def test_text_only_template_can_use_blank_canvas(self):
  self.assertEqual(png_size(blank_page_png()),(1200,900))
 def test_failed_download_retry_never_concatenates_partial_output(self):
  failed=subprocess.CalledProcessError(18,['curl'],output=b'partial')
  with patch.object(harvest.subprocess,'check_output',side_effect=[failed,b'complete']) as call, patch.object(harvest.time,'sleep'):
   self.assertEqual(harvest.get('https://storage.googleapis.com/example'),b'complete')
   self.assertNotIn('--retry',call.call_args_list[0].args[0])
 def test_emergent_level(self):self.assertEqual(LEVEL_LABELS['5'],'Level 1 (Emergent Readers)')
if __name__=='__main__':unittest.main()
