import type { Metadata } from "next";
import { requireHR } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { orgToday } from "@/lib/utils";
import { EmployeeForm } from "../_components/employee-form";
import { loadFormOptions, suggestEmployeeCode } from "../_data";

export const metadata: Metadata = { title: "Add Employee" };

export default async function NewEmployeePage() {
  const me = await requireHR();
  const [options, code] = await Promise.all([loadFormOptions(), suggestEmployeeCode()]);

  return (
    <div>
      <PageHeader
        title="Add Employee"
        description="Creates the record, prorated leave, an onboarding checklist and the IT setup request, and can email a welcome message."
        breadcrumbs={[{ label: "HRIS", href: "/hris" }, { label: "Employee List", href: "/hris/employees" }, { label: "Add Employee" }]}
      />
      <EmployeeForm
        mode="create"
        canGrantAdmin={me.isSuperAdmin}
        options={options}
        values={{
          first_name: "",
          last_name: "",
          email: "",
          employee_code: code,
          phone: null,
          gender: null,
          date_of_birth: null,
          date_of_joining: orgToday(),
          department_id: null,
          designation_id: null,
          location_id: null,
          manager_id: null,
          role: "employee",
          status: "active",
          employment_type: "full_time",
          probation_end_date: null,
        }}
      />
    </div>
  );
}
