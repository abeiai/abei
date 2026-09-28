UPDATE "learning_material_textbooks"
SET "title" =
  btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            "title",
            '[（(]\s*五[·•・．.\s]*四学制\s*[）)]',
            '',
            'g'
          ),
          '^[·•・．\s]+|[·•・．\s]+$',
          '',
          'g'
        ),
        '\s+',
        '',
        'g'
      ),
      '$',
      '（五·四学制）'
    )
  )
WHERE "title" ~ '[（(]\s*五[·•・．.\s]*四学制\s*[）)]';
