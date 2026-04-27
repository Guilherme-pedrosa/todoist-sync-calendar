import { useParams } from 'react-router-dom';
import { TaskList } from '@/components/TaskList';

export default function LabelPage() {
  const { labelId } = useParams<{ labelId: string }>();
  return <TaskList view="label" labelId={labelId} />;
}
