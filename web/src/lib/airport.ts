// Aeroport domeni uchun umumiy yordamchilar: yorliqlar va texnika turi bo'yicha mantiq.
import { useI18n } from '../i18n';
import type { EquipGroup, NormBasis, PowerType, Position, Shift, Vehicle } from '../api';

export const GROUPS: EquipGroup[] = ['aircraft', 'passenger', 'cargo', 'airfield', 'road'];
export const BASES: NormBasis[] = ['km', 'hour', 'both', 'electric'];
export const POWERS: PowerType[] = ['diesel', 'petrol', 'gas', 'electric', 'hybrid'];
export const POSITIONS: Position[] = ['driver', 'operator', 'mechanic', 'loader'];
export const SHIFTS: Shift[] = ['day', 'night', 'full'];

/** Texnika guruhi uchun belgi — ro'yxatlarda tezda ajratish uchun. */
export const GROUP_ICON: Record<EquipGroup, string> = {
  aircraft: '✈️', passenger: '🧳', cargo: '📦', airfield: '🛫', road: '🚗',
};

export const GROUP_BADGE: Record<EquipGroup, string> = {
  aircraft: 'blue', passenger: 'green', cargo: 'amber', airfield: 'red', road: '',
};

/** Tilga mos yorliqlar to'plami. */
export function useAirportLabels() {
  const { t } = useI18n();
  return {
    group: {
      aircraft: t('groupAircraft'), passenger: t('groupPassenger'), cargo: t('groupCargo'),
      airfield: t('groupAirfield'), road: t('groupRoad'),
    } as Record<EquipGroup, string>,
    basis: {
      km: t('basisKm'), hour: t('basisHour'), both: t('basisBoth'), electric: t('basisElectric'),
    } as Record<NormBasis, string>,
    power: {
      diesel: t('powerDiesel'), petrol: t('powerPetrol'), gas: t('powerGas'),
      electric: t('powerElectric'), hybrid: t('powerHybrid'),
    } as Record<PowerType, string>,
    position: {
      driver: t('posDriver'), operator: t('posOperator'),
      mechanic: t('posMechanic'), loader: t('posLoader'),
    } as Record<Position, string>,
    shift: {
      day: t('shiftDay'), night: t('shiftNight'), full: t('shiftFull'),
    } as Record<Shift, string>,
    serviceUnit: {
      flight: t('unitFlight'), ton: t('unitTon'), uld: t('unitUld'),
      pax: t('unitPax'), hour: t('unitHour'),
    } as Record<string, string>,
  };
}

/** Norma asosiga qarab qaysi maydonlar kerakligini aniqlaydi. */
export const usesKm = (basis?: NormBasis) => basis === 'km' || basis === 'both';
export const usesHours = (basis?: NormBasis) => basis === 'hour' || basis === 'both' || basis === 'electric';

/** Perron/yuk texnikasi — reysga xizmat operatsiyalari kiritiladi. */
export const isGse = (group?: EquipGroup) =>
  group === 'aircraft' || group === 'passenger' || group === 'cargo';

/** Yoqilg'i o'lchov birligi (elektr texnikada kVt·soat). */
export const fuelUnit = (v: Pick<Vehicle, 'power_type'> | undefined, lang: 'uz' | 'ru') =>
  v?.power_type === 'electric' ? (lang === 'uz' ? 'kVt·s' : 'кВт·ч') : (lang === 'uz' ? 'l' : 'л');
