import re
import unittest

from app.audio_gateway.providers.dashscope_audio_adapter import subtitle_artifacts_from_response, subtitle_srt_from_response


def timed_words_from_text(text):
    tokens = re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*|[\u4e00-\u9fff]", text)
    return [
        {
            "begin_time": index * 100,
            "end_time": (index + 1) * 100,
            "text": token,
        }
        for index, token in enumerate(tokens)
    ]


class SubtitleEngineTest(unittest.TestCase):
    def test_generates_sentence_level_srt_from_fun_asr_words(self):
        result = {
            "transcripts": [
                {
                    "sentences": [
                        {
                            "begin_time": 100,
                            "end_time": 3820,
                            "text": "Firefighters do these training exercises all the time.",
                            "sentence_end": True,
                            "words": [
                                {"begin_time": 100, "end_time": 600, "text": "Firefighters"},
                                {"begin_time": 600, "end_time": 900, "text": "do"},
                                {"begin_time": 900, "end_time": 1220, "text": "these"},
                                {"begin_time": 1220, "end_time": 1700, "text": "training"},
                                {"begin_time": 1700, "end_time": 2300, "text": "exercises"},
                                {"begin_time": 2300, "end_time": 2600, "text": "all"},
                                {"begin_time": 2600, "end_time": 2900, "text": "the"},
                                {"begin_time": 2900, "end_time": 3820, "text": "time."},
                            ],
                        },
                        {
                            "begin_time": 4500,
                            "end_time": 7800,
                            "text": "Let's watch and see.",
                            "sentence_end": True,
                            "words": [
                                {"begin_time": 4500, "end_time": 5000, "text": "Let's"},
                                {"begin_time": 5000, "end_time": 5450, "text": "watch"},
                                {"begin_time": 5450, "end_time": 5900, "text": "and"},
                                {"begin_time": 5900, "end_time": 7800, "text": "see."},
                            ],
                        },
                    ]
                }
            ]
        }

        self.assertEqual(
            subtitle_srt_from_response(result),
            "\n\n".join(
                [
                    "1\n00:00:00,100 --> 00:00:03,820\nFirefighters do these training exercises all the time.",
                    "2\n00:00:04,500 --> 00:00:07,800\nLet's watch and see.",
                ]
            ),
        )

    def test_pause_splits_without_punctuation(self):
        result = {
            "transcripts": [
                {
                    "sentences": [
                        {
                            "sentence_end": False,
                            "words": [
                                {"begin_time": 0, "end_time": 300, "text": "First"},
                                {"begin_time": 300, "end_time": 700, "text": "phrase"},
                                {"begin_time": 1600, "end_time": 2000, "text": "Second"},
                                {"begin_time": 2000, "end_time": 2500, "text": "phrase"},
                            ],
                        }
                    ]
                }
            ]
        }

        self.assertIn("00:00:00,000 --> 00:00:00,700\nFirst phrase", subtitle_srt_from_response(result))
        self.assertIn("00:00:01,600 --> 00:00:02,500\nSecond phrase", subtitle_srt_from_response(result))

    def test_sentence_punctuation_has_priority_over_internal_pause(self):
        result = {
            "transcripts": [
                {
                    "sentences": [
                        {
                            "words": [
                                {"begin_time": 0, "end_time": 300, "text": "Today"},
                                {"begin_time": 1250, "end_time": 1500, "text": "I'm"},
                                {"begin_time": 1500, "end_time": 1800, "text": "trying"},
                                {"begin_time": 1800, "end_time": 2300, "text": "again."},
                            ],
                        }
                    ]
                }
            ]
        }

        self.assertEqual(
            subtitle_srt_from_response(result),
            "1\n00:00:00,000 --> 00:00:02,300\nToday I'm trying again.",
        )

    def test_parent_sentence_punctuation_is_applied_to_last_word_time(self):
        result = {
            "transcripts": [
                {
                    "sentences": [
                        {
                            "text": "Can you see it?",
                            "words": [
                                {"begin_time": 100, "end_time": 300, "text": "Can"},
                                {"begin_time": 300, "end_time": 500, "text": "you"},
                                {"begin_time": 500, "end_time": 700, "text": "see"},
                                {"begin_time": 700, "end_time": 900, "text": "it"},
                            ],
                        }
                    ]
                }
            ]
        }

        self.assertEqual(
            subtitle_srt_from_response(result),
            "1\n00:00:00,100 --> 00:00:00,900\nCan you see it?",
        )

    def test_parent_paragraph_text_splits_words_into_display_sentences(self):
        paragraph = (
            "Firefighters do these training exercises all the time. "
            "So how do you think the firemen are going to put out the fire? "
            "Let's watch and see. "
            "They're pulling out a long ladder, and that will mean they can get right up to the top where we can see the smoke on the fire tower. "
            "This fireman has a giant hose, and just look how much water is coming out of the end of that. "
            "The water is coming out so fast and is so powerful that it's able to reach all the way up to the top where the smoke's coming out of the fire tower."
        )
        result = {
            "transcripts": [
                {
                    "text": paragraph,
                    "words": timed_words_from_text(paragraph),
                }
            ]
        }

        self.assertEqual(
            subtitle_srt_from_response(result),
            "\n\n".join(
                [
                    "1\n00:00:00,000 --> 00:00:00,800\nFirefighters do these training exercises all the time.",
                    "2\n00:00:00,800 --> 00:00:02,200\nSo how do you think the firemen are going to put out the fire?",
                    "3\n00:00:02,200 --> 00:00:02,600\nLet's watch and see.",
                    "4\n00:00:02,600 --> 00:00:05,400\nThey're pulling out a long ladder, and that will mean they can get right up to the top where we can see the smoke on the fire tower.",
                    "5\n00:00:05,400 --> 00:00:07,400\nThis fireman has a giant hose, and just look how much water is coming out of the end of that.",
                    "6\n00:00:07,400 --> 00:00:10,600\nThe water is coming out so fast and is so powerful that it's able to reach all the way up to the top where the smoke's coming out of the fire tower.",
                ]
            ),
        )

    def test_dotted_abbreviation_does_not_split_into_separate_subtitles(self):
        paragraph = (
            "And he presided over the convention that created the U.S.Constitution. "
            "It established the framework of the federal government."
        )
        result = {
            "transcript": {
                "text": paragraph,
                "words": timed_words_from_text(paragraph),
            }
        }

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            [
                "And he presided over the convention that created the U.S. Constitution.",
                "It established the framework of the federal government.",
            ],
        )

    def test_abbreviations_and_decimals_preserve_real_sentence_boundaries(self):
        paragraph = (
            "Dr. Smith recorded a value of 3.14. "
            "He later worked in the U.S. Yesterday he returned home. "
            "He is Martin Luther King Jr. His legacy endures."
        )
        result = {
            "transcript": {
                "text": paragraph,
                "words": timed_words_from_text(paragraph),
            }
        }

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            [
                "Dr. Smith recorded a value of 3.14.",
                "He later worked in the U.S.",
                "Yesterday he returned home.",
                "He is Martin Luther King Jr.",
                "His legacy endures.",
            ],
        )

    def test_sentence_cleanup_does_not_join_a_sentence_to_a_following_initial(self):
        paragraph = "The meeting ended. S. Truman arrived."
        result = {
            "transcript": {
                "text": paragraph,
                "words": timed_words_from_text(paragraph),
            }
        }

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            [
                "The meeting ended.",
                "S. Truman arrived.",
            ],
        )

    def test_abbreviation_before_a_proper_noun_stays_in_the_same_sentence(self):
        paragraph = (
            "He studied the U.S. Constitution. "
            "Martin Luther King Jr. Foundation supports education. "
            "He lives on Main St. She visits often."
        )
        result = {
            "transcript": {
                "text": paragraph,
                "words": timed_words_from_text(paragraph),
            }
        }

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            [
                "He studied the U.S. Constitution.",
                "Martin Luther King Jr. Foundation supports education.",
                "He lives on Main St.",
                "She visits often.",
            ],
        )

    def test_word_timeline_fallback_keeps_dotted_abbreviation_together(self):
        words = [
            {"begin_time": 0, "end_time": 100, "text": "They"},
            {"begin_time": 100, "end_time": 200, "text": "created"},
            {"begin_time": 200, "end_time": 300, "text": "the"},
            {"begin_time": 300, "end_time": 400, "text": "U."},
            {"begin_time": 400, "end_time": 500, "text": "S."},
            {"begin_time": 500, "end_time": 700, "text": "Constitution."},
        ]
        result = {"transcript": {"words": words}}

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            ["They created the U.S. Constitution."],
        )

    def test_explicit_sentence_end_has_priority_over_abbreviation_heuristics(self):
        result = {
            "transcripts": [
                {
                    "text": "He moved to the U.S.",
                    "sentence_end": True,
                    "words": [
                        {"begin_time": 0, "end_time": 100, "text": "He"},
                        {"begin_time": 100, "end_time": 200, "text": "moved"},
                        {"begin_time": 200, "end_time": 300, "text": "to"},
                        {"begin_time": 300, "end_time": 400, "text": "the"},
                        {"begin_time": 400, "end_time": 500, "text": "U.S."},
                    ],
                },
                {
                    "text": "Congress approved the bill.",
                    "sentence_end": True,
                    "words": [
                        {"begin_time": 600, "end_time": 700, "text": "Congress"},
                        {"begin_time": 700, "end_time": 800, "text": "approved"},
                        {"begin_time": 800, "end_time": 900, "text": "the"},
                        {"begin_time": 900, "end_time": 1000, "text": "bill."},
                    ],
                },
            ]
        }

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            [
                "He moved to the U.S.",
                "Congress approved the bill.",
            ],
        )

    def test_abbreviation_before_first_amendment_stays_in_the_same_sentence(self):
        paragraph = "The U.S. First Amendment protects speech."
        result = {
            "transcript": {
                "text": paragraph,
                "words": timed_words_from_text(paragraph),
            }
        }

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            ["The U.S. First Amendment protects speech."],
        )

    def test_returns_punctuated_text_words_and_sentence_subtitles(self):
        paragraph = "What happens when you break a bone? Let's find out."
        result = {
            "output": {
                "transcript": {
                    "punctuatedText": paragraph,
                    "words": timed_words_from_text(paragraph),
                }
            }
        }

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(artifacts["punctuatedText"], paragraph)
        self.assertEqual(artifacts["wordTimeline"][0]["text"], "What")
        self.assertEqual(artifacts["wordTimeline"][0]["beginTime"], 0)
        self.assertEqual(artifacts["sentenceSubtitles"][0]["text"], "What happens when you break a bone?")
        self.assertEqual(artifacts["sentenceSubtitles"][1]["text"], "Let's find out.")
        self.assertEqual(
            artifacts["srtText"],
            "\n\n".join(
                [
                    "1\n00:00:00,000 --> 00:00:00,700\nWhat happens when you break a bone?",
                    "2\n00:00:00,700 --> 00:00:01,000\nLet's find out.",
                ]
            ),
        )

    def test_punctuated_text_alignment_tolerates_missing_words(self):
        paragraph = (
            "Hmm. "
            "Roughly 50% of people will break a bone at some point in their lives. "
            "But whether the cause is as mundane as a slip on the ice, or as dramatic as a tightrope walking accident, broken bones tend to heal the same way."
        )
        words = [
            {"begin_time": 0, "end_time": 160, "text": "Hmm"},
            {"begin_time": 6412, "end_time": 6732, "text": "Roughly"},
            {"begin_time": 7052, "end_time": 7532, "text": "50%"},
            {"begin_time": 7532, "end_time": 7612, "text": "of"},
            {"begin_time": 7612, "end_time": 8092, "text": "people"},
            {"begin_time": 8092, "end_time": 8172, "text": "will"},
            {"begin_time": 8252, "end_time": 8492, "text": "break"},
            {"begin_time": 8492, "end_time": 8572, "text": "a"},
            {"begin_time": 8572, "end_time": 8892, "text": "bone"},
            {"begin_time": 9132, "end_time": 9212, "text": "at"},
            {"begin_time": 9212, "end_time": 9452, "text": "some"},
            {"begin_time": 9452, "end_time": 9692, "text": "point"},
            {"begin_time": 9692, "end_time": 9772, "text": "in"},
            {"begin_time": 9772, "end_time": 9932, "text": "their"},
            {"begin_time": 9932, "end_time": 10412, "text": "lives"},
            {"begin_time": 10892, "end_time": 10972, "text": "But"},
            {"begin_time": 10972, "end_time": 11212, "text": "whether"},
            {"begin_time": 11212, "end_time": 11292, "text": "the"},
            {"begin_time": 11292, "end_time": 11772, "text": "cause"},
            {"begin_time": 11772, "end_time": 12012, "text": "is"},
            {"begin_time": 12012, "end_time": 12092, "text": "as"},
            {"begin_time": 12092, "end_time": 12652, "text": "mundane"},
            {"begin_time": 12652, "end_time": 12812, "text": "as"},
            {"begin_time": 12812, "end_time": 13132, "text": "a"},
            {"begin_time": 13132, "end_time": 13212, "text": "slip"},
            {"begin_time": 13212, "end_time": 13292, "text": "on"},
            {"begin_time": 13292, "end_time": 13452, "text": "the"},
            {"begin_time": 13452, "end_time": 13772, "text": "ice"},
            {"begin_time": 14092, "end_time": 14252, "text": "or"},
            {"begin_time": 14252, "end_time": 14332, "text": "as"},
            {"begin_time": 14332, "end_time": 15052, "text": "dramatic"},
            {"begin_time": 15052, "end_time": 15212, "text": "as"},
            {"begin_time": 15372, "end_time": 15852, "text": "tightrope"},
            {"begin_time": 15932, "end_time": 16252, "text": "walking"},
            {"begin_time": 17372, "end_time": 17692, "text": "broken"},
            {"begin_time": 17692, "end_time": 18172, "text": "bones"},
            {"begin_time": 18252, "end_time": 18492, "text": "tend"},
            {"begin_time": 18572, "end_time": 18972, "text": "heal"},
            {"begin_time": 18972, "end_time": 19052, "text": "the"},
            {"begin_time": 19052, "end_time": 19372, "text": "same"},
            {"begin_time": 19372, "end_time": 19772, "text": "way"},
        ]
        result = {"transcript": {"text": paragraph, "words": words}}

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            [
                "Hmm.",
                "Roughly 50% of people will break a bone at some point in their lives.",
                "But whether the cause is as mundane as a slip on the ice, or as dramatic as a tightrope walking accident, broken bones tend to heal the same way.",
            ],
        )
        self.assertEqual(artifacts["sentenceSubtitles"][0]["timeRange"], "00:00:00,000 --> 00:00:00,160")
        self.assertEqual(artifacts["sentenceSubtitles"][1]["timeRange"], "00:00:06,412 --> 00:00:10,412")
        self.assertEqual(artifacts["sentenceSubtitles"][2]["timeRange"], "00:00:10,892 --> 00:00:19,772")

    def test_cleans_overlapping_asr_boundaries(self):
        paragraph = (
            "For theFor the next week, the body floods the injury site. "
            "Cartilage can grow quickly, but it's.But it's much weaker than bone."
        )
        words = [
            {"begin_time": 0, "end_time": 160, "text": "For"},
            {"begin_time": 160, "end_time": 240, "text": "the"},
            {"begin_time": 16, "end_time": 176, "text": "For"},
            {"begin_time": 176, "end_time": 256, "text": "the"},
            {"begin_time": 256, "end_time": 496, "text": "next"},
            {"begin_time": 496, "end_time": 816, "text": "week"},
            {"begin_time": 816, "end_time": 896, "text": "the"},
            {"begin_time": 896, "end_time": 1136, "text": "body"},
            {"begin_time": 1136, "end_time": 1616, "text": "floods"},
            {"begin_time": 1616, "end_time": 1696, "text": "the"},
            {"begin_time": 1696, "end_time": 2016, "text": "injury"},
            {"begin_time": 2016, "end_time": 2336, "text": "site"},
            {"begin_time": 3000, "end_time": 3400, "text": "Cartilage"},
            {"begin_time": 3400, "end_time": 3480, "text": "can"},
            {"begin_time": 3480, "end_time": 3880, "text": "grow"},
            {"begin_time": 3880, "end_time": 4360, "text": "quickly"},
            {"begin_time": 4840, "end_time": 4920, "text": "but"},
            {"begin_time": 4920, "end_time": 5080, "text": "it's"},
            {"begin_time": 4824, "end_time": 4984, "text": "But"},
            {"begin_time": 4984, "end_time": 5064, "text": "it's"},
            {"begin_time": 5064, "end_time": 5384, "text": "much"},
            {"begin_time": 5384, "end_time": 5624, "text": "weaker"},
            {"begin_time": 5624, "end_time": 5864, "text": "than"},
            {"begin_time": 5864, "end_time": 6104, "text": "bone"},
        ]
        result = {"transcript": {"text": paragraph, "words": words}}

        artifacts = subtitle_artifacts_from_response(result)

        self.assertEqual(
            artifacts["punctuatedText"],
            "For the next week, the body floods the injury site. Cartilage can grow quickly, but it's much weaker than bone.",
        )
        self.assertEqual([word["text"] for word in artifacts["wordTimeline"][:4]], ["For", "the", "next", "week"])
        self.assertEqual(
            [item["text"] for item in artifacts["sentenceSubtitles"]],
            [
                "For the next week, the body floods the injury site.",
                "Cartilage can grow quickly, but it's much weaker than bone.",
            ],
        )


if __name__ == "__main__":
    unittest.main()
