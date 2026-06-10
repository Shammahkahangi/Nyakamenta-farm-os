import { Redirect } from 'expo-router';
import { isManagerRole } from '../../../src/auth/estateRole';

export default function FarmIndex() {
  return (
    <Redirect href={isManagerRole() ? '/(app)/farm/manager-overview' : '/(app)/farm/owner-overview'} />
  );
}
