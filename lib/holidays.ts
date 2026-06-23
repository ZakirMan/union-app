// lib/holidays.ts

// Фиксированные государственные и национальные праздники (месяц 0-11, день 1-31)
const FIXED_HOLIDAYS = [
  { month: 0, day: 1 },  // Новый год
  { month: 0, day: 2 },  // Новый год
  { month: 0, day: 7 },  // Рождество
  { month: 2, day: 8 },  // 8 марта
  { month: 2, day: 21 }, // Наурыз
  { month: 2, day: 22 }, // Наурыз
  { month: 2, day: 23 }, // Наурыз
  { month: 4, day: 1 },  // День единства
  { month: 4, day: 7 },  // День защитника Отечества
  { month: 4, day: 9 },  // День Победы
  { month: 6, day: 6 },  // День Столицы
  { month: 7, day: 30 }, // День Конституции
  { month: 9, day: 25 }, // День Республики
  { month: 11, day: 16 } // День Независимости
];

// Курбан Айт (примерные даты на 2024-2030)
const KURBAN_AIT_DATES = [
  '2024-06-16',
  '2025-06-06',
  '2026-05-27',
  '2027-05-16',
  '2028-05-05',
  '2029-04-24',
  '2030-04-13',
];

export function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  // Выходные: 0 - Воскресенье, 6 - Суббота
  if (day === 0 || day === 6) {
    // В Казахстане бывают переносы, но для базового расчета мы считаем сб и вс нерабочими.
    return false;
  }

  const month = date.getMonth();
  const dateNum = date.getDate();

  // Проверка фиксированных праздников
  if (FIXED_HOLIDAYS.some(h => h.month === month && h.day === dateNum)) {
    return false;
  }

  // Проверка Курбан Айта
  const dateString = date.toISOString().split('T')[0];
  if (KURBAN_AIT_DATES.includes(dateString)) {
    return false;
  }

  return true;
}

// Вычисляет дату дедлайна, прибавляя рабочие дни к дате начала
export function getDeadlineDate(startDate: Date, workingDays: number): Date {
  let currentDate = new Date(startDate);
  // Сбрасываем время до полуночи для точных расчетов
  currentDate.setHours(0, 0, 0, 0);

  let daysToAdd = workingDays;

  while (daysToAdd > 0) {
    currentDate.setDate(currentDate.getDate() + 1);
    if (isWorkingDay(currentDate)) {
      daysToAdd--;
    }
  }

  return currentDate;
}

// Возвращает количество оставшихся рабочих дней от сегодня до дедлайна
// Если дедлайн прошел, возвращает отрицательное число
export function getWorkingDaysLeft(startDateISO: string, totalWorkingDays: number): number {
  const startDate = new Date(startDateISO);
  const deadlineDate = getDeadlineDate(startDate, totalWorkingDays);
  
  let today = new Date();
  today.setHours(0, 0, 0, 0);
  deadlineDate.setHours(0, 0, 0, 0);

  if (today > deadlineDate) {
    // Дедлайн прошел
    let expiredDays = 0;
    let tempDate = new Date(deadlineDate);
    while (tempDate < today) {
      tempDate.setDate(tempDate.getDate() + 1);
      if (isWorkingDay(tempDate)) {
        expiredDays--;
      }
    }
    return expiredDays; // Будет отрицательным
  } else {
    // Дедлайн в будущем или сегодня
    let daysLeft = 0;
    let tempDate = new Date(today);
    while (tempDate < deadlineDate) {
      tempDate.setDate(tempDate.getDate() + 1);
      if (isWorkingDay(tempDate)) {
        daysLeft++;
      }
    }
    return daysLeft;
  }
}
