const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 3000);
const TZ = process.env.EXAM_TIMEZONE || 'Asia/Kabul';
const START = process.env.EXAM_START || '20:00';
const END = process.env.EXAM_END || '20:30';
const QUESTION_SECONDS = Number(process.env.QUESTION_SECONDS || 25);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY, participant_name TEXT NOT NULL, exam_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ,
  correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0, unanswered INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 10, duration_ms INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS answers (
  attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL, selected_index INTEGER, is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  elapsed_ms INTEGER NOT NULL DEFAULT 0, answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, question_index)
);
CREATE INDEX IF NOT EXISTS attempts_exam_date_idx ON attempts(exam_date);`;

const questions = [
  {q:'A patient presents with pressure-like chest pain and ST-segment elevation in the anterior leads. What is the most appropriate initial management?',o:['Exercise stress testing','Immediate appropriate reperfusion therapy for STEMI','Wait for a second troponin result','PPI therapy alone'],a:1,e:'In STEMI, prompt diagnosis and reperfusion are critical; treatment should not be delayed for serial troponin testing or stress testing.'},
  {q:'In a patient with nonvalvular atrial fibrillation, what is the primary purpose of the CHA₂DS₂-VASc score?',o:['To estimate bleeding risk','To estimate thromboembolic stroke risk and guide anticoagulation decisions','To determine the severity of mitral stenosis','To identify the cause of atrial fibrillation'],a:1,e:'CHA₂DS₂-VASc is used to estimate thromboembolic stroke risk in atrial fibrillation and to help guide stroke-prevention decisions.'},
  {q:'Which finding most strongly supports SIADH in a patient with hyponatremia?',o:['High serum osmolality with very dilute urine','Low serum osmolality, inappropriately concentrated urine, and an apparently euvolemic state','Severe edema with very low urine sodium','Hypernatremia with polyuria'],a:1,e:'SIADH typically causes hypotonic hyponatremia with inappropriately non-suppressed urine osmolality and an apparently euvolemic clinical state.'},
  {q:'In severe hyperkalemia, which ECG abnormality most strongly indicates the need for immediate cardiac membrane stabilization?',o:['Peaked T waves alone','Prolonged PR interval with QRS widening','Mild sinus bradycardia','QT prolongation'],a:1,e:'Major conduction abnormalities such as QRS widening in hyperkalemia require urgent membrane stabilization, typically with intravenous calcium.'},
  {q:'A patient develops hypotension, abdominal pain, hyponatremia, and hyperkalemia after discontinuing corticosteroids. What is the most likely diagnosis?',o:['Thyrotoxicosis','Primary adrenal insufficiency with adrenal crisis','SIADH','Diabetes insipidus'],a:1,e:'Hypotension, hyponatremia, hyperkalemia, and recent glucocorticoid withdrawal strongly suggest adrenal insufficiency; instability raises concern for adrenal crisis.'},
  {q:'Which statement about serum potassium in diabetic ketoacidosis (DKA) is correct?',o:['Serum potassium is always low, so insulin should always be given immediately','Serum potassium may be normal or high despite a reduced total-body potassium level','Total-body potassium is always increased','Insulin has no effect on potassium distribution'],a:1,e:'In DKA, insulin deficiency and acidosis shift potassium out of cells, so serum potassium may be normal or high even though total-body potassium is usually depleted.'},
  {q:'In a patient with suspected pulmonary embolism and hemodynamic instability, which approach is most appropriate?',o:['Always wait for CT pulmonary angiography regardless of hemodynamic status','Urgently assess and treat high-risk PE, including consideration of reperfusion therapy when appropriate','Perform an exercise stress test','Use a diuretic as the primary treatment'],a:1,e:'High-risk PE with hemodynamic instability requires urgent management, and reperfusion therapy should be considered when clinically appropriate.'},
  {q:'Which finding is most characteristic of nephrotic syndrome?',o:['Heavy proteinuria, hypoalbuminemia, and edema','Mild hematuria without proteinuria','Hypernatremia and polyuria','Leukocytosis and pyuria alone'],a:0,e:'Nephrotic syndrome is characterized by heavy proteinuria, hypoalbuminemia, and edema; hyperlipidemia is also commonly present.'},
  {q:'In a patient with cirrhosis and ascites, which ascitic-fluid finding supports spontaneous bacterial peritonitis (SBP)?',o:['PMN count below 50/mm³','Ascitic-fluid PMN count ≥250/mm³','Isolated elevation of ascitic albumin','High glucose alone'],a:1,e:'SBP is diagnosed clinically when the ascitic-fluid polymorphonuclear leukocyte count is ≥250 cells/mm³, without waiting for culture results.'},
  {q:'Which laboratory pattern is most consistent with iron deficiency anemia?',o:['High MCV, high ferritin, and low TIBC','Low MCV, low ferritin, and high TIBC','Normal MCV, very high ferritin, and high TIBC','Marked reticulocytosis without depletion of iron stores'],a:1,e:'Classic iron deficiency anemia is characterized by microcytosis, low ferritin, and increased TIBC; low ferritin indicates depleted iron stores.'}
];

function fmtLocalParts(date=new Date()) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const o={}; for(const p of parts) o[p.type]=p.value; return o;
}
function localDate(){const p=fmtLocalParts(); return `${p.year}-${p.month}-${p.day}`;}
function localMinutes(){const p=fmtLocalParts(); return Number(p.hour)*60+Number(p.minute)+Number(p.second)/60;}
function windowState(){const [sh,sm]=START.split(':').map(Number), [eh,em]=END.split(':').map(Number); const m=localMinutes(), s=sh*60+sm, e=eh*60+em; return m<s?'before':m<e?'open':'after';}
function inWindow(){return windowState()==='open';}
function publicQuestions(){return questions.map(({q,o})=>({q,o}));}

app.get('/health',(req,res)=>res.json({ok:true,serverNow:new Date().toISOString(),timezone:TZ}));
app.get('/api/config',(req,res)=>{const state=windowState();res.json({serverNow:new Date().toISOString(),timezone:TZ,start:START,end:END,windowState:state,inWindow:state==='open',examDate:localDate(),totalQuestions:questions.length});});

app.post('/api/start', async (req,res)=>{
  try {
    if(!inWindow()) return res.status(403).json({error:'EXAM_CLOSED',message:'The exam is available only from 20:00 to 20:30 (Asia/Kabul).'});
    const participantName=String(req.body?.name||'').trim().slice(0,100);
    if(!participantName) return res.status(400).json({error:'NAME_REQUIRED'});
    const id=uuidv4();
    await pool.query('INSERT INTO attempts(id,participant_name,exam_date,started_at,total_questions) VALUES($1,$2,$3,NOW(),$4)',[id,participantName,localDate(),questions.length]);
    res.json({attemptId:id,startedAt:new Date().toISOString(),serverNow:new Date().toISOString(),questions:publicQuestions(),questionSeconds:QUESTION_SECONDS,totalQuestions:questions.length});
  } catch(e){ console.error(e); res.status(500).json({error:'SERVER_ERROR'}); }
});

app.post('/api/answer', async (req,res)=>{
  try {
    if(!inWindow()) return res.status(403).json({error:'EXAM_CLOSED'});
    const {attemptId,questionIndex,selectedIndex,elapsedMs}=req.body||{};
    if(!attemptId || !Number.isInteger(questionIndex) || questionIndex<0 || questionIndex>=questions.length) return res.status(400).json({error:'INVALID_QUESTION'});
    const idx = selectedIndex===null ? null : Number(selectedIndex);
    if(idx!==null && (!Number.isInteger(idx) || idx<0 || idx>=questions[questionIndex].o.length)) return res.status(400).json({error:'INVALID_OPTION'});
    const a=await pool.query('SELECT * FROM attempts WHERE id=$1',[attemptId]);
    if(!a.rowCount) return res.status(404).json({error:'ATTEMPT_NOT_FOUND'});
    const attempt=a.rows[0];
    if(attempt.finished_at) return res.status(409).json({error:'ATTEMPT_FINISHED'});
    const existing=await pool.query('SELECT 1 FROM answers WHERE attempt_id=$1 AND question_index=$2',[attemptId,questionIndex]);
    if(existing.rowCount) return res.status(409).json({error:'ALREADY_ANSWERED'});
    const correct=idx!==null && idx===questions[questionIndex].a;
    await pool.query('INSERT INTO answers(attempt_id,question_index,selected_index,is_correct,elapsed_ms) VALUES($1,$2,$3,$4,$5)',[attemptId,questionIndex,idx,correct,Math.max(0,Math.min(Number(elapsedMs)||0,QUESTION_SECONDS*1000))]);
    res.json({correct,correctIndex:questions[questionIndex].a,explanation:questions[questionIndex].e,serverNow:new Date().toISOString()});
  }catch(e){console.error(e);res.status(500).json({error:'SERVER_ERROR'});}
});

app.post('/api/finish', async (req,res)=>{
  try{
    const {attemptId}=req.body||{}; if(!attemptId) return res.status(400).json({error:'ATTEMPT_REQUIRED'});
    const a=await pool.query('SELECT * FROM attempts WHERE id=$1',[attemptId]); if(!a.rowCount) return res.status(404).json({error:'ATTEMPT_NOT_FOUND'});
    const attempt=a.rows[0];
    if(!attempt.finished_at){
      const count=await pool.query('SELECT COUNT(*)::int AS n, COUNT(*) FILTER(WHERE is_correct)::int AS c FROM answers WHERE attempt_id=$1',[attemptId]);
      const n=count.rows[0].n, c=count.rows[0].c;
      const wrong=n-c, unanswered=questions.length-n;
      await pool.query('UPDATE attempts SET finished_at=NOW(),correct=$2,wrong=$3,unanswered=$4,duration_ms=EXTRACT(EPOCH FROM (NOW()-started_at))*1000 WHERE id=$1',[attemptId,c,wrong,unanswered]);
    }
    const f=await pool.query('SELECT * FROM attempts WHERE id=$1',[attemptId]);
    const row=f.rows[0];
    const rankQ=await pool.query(`SELECT id,participant_name,correct,wrong,unanswered,total_questions,duration_ms,finished_at FROM attempts WHERE exam_date=$1 AND finished_at IS NOT NULL ORDER BY correct DESC, duration_ms ASC, finished_at ASC`,[row.exam_date]);
    const rank=rankQ.rows.findIndex(x=>x.id===attemptId)+1;
    res.json({result:{name:row.participant_name,correct:row.correct,wrong:row.wrong,unanswered:row.unanswered,total:row.total_questions,percent:Math.round(row.correct/row.total_questions*100),durationMs:row.duration_ms,rank},ranking:rankQ.rows.map((x,i)=>({rank:i+1,name:x.participant_name,correct:x.correct,wrong:x.wrong,unanswered:x.unanswered,total:x.total_questions,percent:Math.round(x.correct/x.total_questions*100),durationMs:x.duration_ms}))});
  }catch(e){console.error(e);res.status(500).json({error:'SERVER_ERROR'});}
});

app.get('/api/ranking', async (req,res)=>{
  try{const q=await pool.query(`SELECT participant_name,correct,wrong,unanswered,total_questions,duration_ms FROM attempts WHERE exam_date=$1 AND finished_at IS NOT NULL ORDER BY correct DESC,duration_ms ASC,finished_at ASC`,[localDate()]);res.json({examDate:localDate(),ranking:q.rows.map((x,i)=>({rank:i+1,name:x.participant_name,correct:x.correct,wrong:x.wrong,unanswered:x.unanswered,total:x.total_questions,percent:Math.round(x.correct/x.total_questions*100),durationMs:x.duration_ms}))});}catch(e){res.status(500).json({error:'SERVER_ERROR'});}
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
async function bootServer(){
  try { await pool.query(SCHEMA); app.listen(PORT,()=>console.log(`Exam server listening on ${PORT}; ${TZ} ${START}-${END}`)); }
  catch(e){ console.error('Database initialization failed:',e); process.exit(1); }
}
bootServer();
