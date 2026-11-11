type AttendanceResponse = {
  status: "going" | "out" | "maybe";
  role?: string | null;
  person: { fullName: string };
};

export function attendanceGroups<T extends AttendanceResponse>(responses: T[]) {
  return ([
    { status: "going", title: "Going", accent: "text-green-700 dark:text-green-400" },
    { status: "out", title: "Not going", accent: "text-red-600 dark:text-red-400" },
    { status: "maybe", title: "Maybe", accent: "text-amber-700 dark:text-amber-400" },
  ] as const).map((group) => {
    const matching = responses
      .filter((response) => response.status === group.status)
      .sort((a, b) => a.person.fullName.localeCompare(b.person.fullName));
    const isStaff = (response: T) => response.role === "coach" || response.role === "manager";
    return {
      ...group,
      coaches: matching.filter(isStaff),
      players: matching.filter((response) => !isStaff(response)),
    };
  });
}
