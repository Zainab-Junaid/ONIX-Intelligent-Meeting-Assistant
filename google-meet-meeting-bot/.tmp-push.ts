import { initMongoConnection } from './src/mongoLayer';
import { pushCaptionsBatch } from './src/captionService';

(async () => {
  await initMongoConnection();
  const segs = Array.from({length:10}).map((_,i)=>({start:i,end:i+1,text:`seg${i}`,speaker:'Bob'}));
  await pushCaptionsBatch('meeting-123', segs, 'user-xyz', 'Test Meeting');
  console.log('pushed');
  process.exit(0);
})();
