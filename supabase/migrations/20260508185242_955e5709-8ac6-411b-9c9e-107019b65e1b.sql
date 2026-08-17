DELETE FROM qualification_messages
  WHERE conversation_id='784fef35-de96-4278-8dae-085e0a253fcd'
    AND role='assistant'
    AND created_at > '2026-05-08 18:50:00+00';
UPDATE qualification_messages SET processed=false, error=null
  WHERE id IN ('9fde7b27-cd0b-4546-b686-da52515bacaa','4133845f-5df2-4861-ba77-d560d31022aa');