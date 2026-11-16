import {PRODUCTION_STAGES,type ProductionStage} from '@/lib/clothing'

/** Horizontal stage tracker: done stages filled navy, current stage yellow. */
export default function ProgressPipeline({stage,compact=false}:{stage:ProductionStage;compact?:boolean}){
  const current=PRODUCTION_STAGES.indexOf(stage)
  return (
    <ol className={`pp ${compact?'pp-compact':''}`} aria-label={`Progress: ${stage}`}>
      {PRODUCTION_STAGES.map((s,i)=>(
        <li key={s} className={i<current?'done':i===current?'now':undefined} aria-current={i===current?'step':undefined}>
          <span className="pp-dot" aria-hidden="true">{i<current?'✓':i+1}</span>
          <span className="pp-name">{s}</span>
        </li>
      ))}
    </ol>
  )
}
