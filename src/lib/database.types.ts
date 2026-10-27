
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "addons": {
                  Row: {
                    "active": boolean,"color": string,"description": string | null,"id": string,"name": string,"sort_order": number,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"color"?: string,"description"?: string | null,"id"?: string,"name": string,"sort_order"?: number,"url": string
                  }
                  Update: {
                    "active"?: boolean,"color"?: string,"description"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number,"url"?: string
                  }
                  Relationships: [
                    
                  ]
                },"announcements": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"id": string,"pinned": boolean,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"pinned"?: boolean,"title": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"pinned"?: boolean,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_records": {
                  Row: {
                    "check_in": string | null,"check_out": string | null,"created_at": string,"date": string,"employee_id": string,"id": string,"notes": string | null,"source": string,"status": string,"work_mode": string
                  }
                  ComputedFields: never
                  Insert: {
                    "check_in"?: string | null,"check_out"?: string | null,"created_at"?: string,"date": string,"employee_id": string,"id"?: string,"notes"?: string | null,"source"?: string,"status"?: string,"work_mode"?: string
                  }
                  Update: {
                    "check_in"?: string | null,"check_out"?: string | null,"created_at"?: string,"date"?: string,"employee_id"?: string,"id"?: string,"notes"?: string | null,"source"?: string,"status"?: string,"work_mode"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_records_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"candidates": {
                  Row: {
                    "created_at": string,"current_company": string | null,"email": string,"experience_years": number | null,"full_name": string,"id": string,"job_id": string,"linkedin_url": string | null,"notes": string | null,"phone": string | null,"referred_by": string | null,"resume_path": string | null,"source": string,"stage": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_company"?: string | null,"email": string,"experience_years"?: number | null,"full_name": string,"id"?: string,"job_id": string,"linkedin_url"?: string | null,"notes"?: string | null,"phone"?: string | null,"referred_by"?: string | null,"resume_path"?: string | null,"source"?: string,"stage"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"current_company"?: string | null,"email"?: string,"experience_years"?: number | null,"full_name"?: string,"id"?: string,"job_id"?: string,"linkedin_url"?: string | null,"notes"?: string | null,"phone"?: string | null,"referred_by"?: string | null,"resume_path"?: string | null,"source"?: string,"stage"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "candidates_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_openings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "candidates_referred_by_fkey"
      columns: ["referred_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"claim_categories": {
                  Row: {
                    "active": boolean,"id": string,"kind": string,"max_amount": number | null,"name": string,"requires_receipt": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"id"?: string,"kind"?: string,"max_amount"?: number | null,"name": string,"requires_receipt"?: boolean
                  }
                  Update: {
                    "active"?: boolean,"id"?: string,"kind"?: string,"max_amount"?: number | null,"name"?: string,"requires_receipt"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"claims": {
                  Row: {
                    "actioned_at": string | null,"amount": number,"approver_id": string | null,"approver_remarks": string | null,"category_id": string,"created_at": string,"description": string | null,"employee_id": string,"expense_date": string,"id": string,"paid_at": string | null,"receipt_path": string | null,"seq": number,"status": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"amount": number,"approver_id"?: string | null,"approver_remarks"?: string | null,"category_id": string,"created_at"?: string,"description"?: string | null,"employee_id": string,"expense_date": string,"id"?: string,"paid_at"?: string | null,"receipt_path"?: string | null,"seq"?: never,"status"?: string,"title": string
                  }
                  Update: {
                    "actioned_at"?: string | null,"amount"?: number,"approver_id"?: string | null,"approver_remarks"?: string | null,"category_id"?: string,"created_at"?: string,"description"?: string | null,"employee_id"?: string,"expense_date"?: string,"id"?: string,"paid_at"?: string | null,"receipt_path"?: string | null,"seq"?: never,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "claims_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claims_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "claim_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claims_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"compoff_requests": {
                  Row: {
                    "actioned_at": string | null,"approver_id": string | null,"approver_remarks": string | null,"created_at": string,"days": number,"employee_id": string,"expires_on": string | null,"id": string,"reason": string,"status": string,"worked_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"days"?: number,"employee_id": string,"expires_on"?: string | null,"id"?: string,"reason": string,"status"?: string,"worked_date": string
                  }
                  Update: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"days"?: number,"employee_id"?: string,"expires_on"?: string | null,"id"?: string,"reason"?: string,"status"?: string,"worked_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "compoff_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "compoff_requests_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"contracts": {
                  Row: {
                    "contract_type": string,"created_at": string,"created_by": string | null,"document_url": string | null,"employee_id": string,"end_date": string | null,"id": string,"start_date": string,"status": string,"terms": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contract_type"?: string,"created_at"?: string,"created_by"?: string | null,"document_url"?: string | null,"employee_id": string,"end_date"?: string | null,"id"?: string,"start_date": string,"status"?: string,"terms"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "contract_type"?: string,"created_at"?: string,"created_by"?: string | null,"document_url"?: string | null,"employee_id"?: string,"end_date"?: string | null,"id"?: string,"start_date"?: string,"status"?: string,"terms"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contracts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contracts_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"course_enrollments": {
                  Row: {
                    "assigned_by": string | null,"completed_at": string | null,"course_id": string,"due_date": string | null,"employee_id": string,"enrolled_at": string,"id": string,"progress": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_by"?: string | null,"completed_at"?: string | null,"course_id": string,"due_date"?: string | null,"employee_id": string,"enrolled_at"?: string,"id"?: string,"progress"?: number,"status"?: string
                  }
                  Update: {
                    "assigned_by"?: string | null,"completed_at"?: string | null,"course_id"?: string,"due_date"?: string | null,"employee_id"?: string,"enrolled_at"?: string,"id"?: string,"progress"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_enrollments_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_enrollments_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "course_enrollments_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "category": string,"content_url": string | null,"created_at": string,"description": string | null,"duration_hours": number,"id": string,"is_mandatory": boolean,"level": string,"modules": NonNullable<Json>,"provider": string,"published": boolean,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"content_url"?: string | null,"created_at"?: string,"description"?: string | null,"duration_hours"?: number,"id"?: string,"is_mandatory"?: boolean,"level"?: string,"modules"?: NonNullable<Json>,"provider"?: string,"published"?: boolean,"title": string
                  }
                  Update: {
                    "category"?: string,"content_url"?: string | null,"created_at"?: string,"description"?: string | null,"duration_hours"?: number,"id"?: string,"is_mandatory"?: boolean,"level"?: string,"modules"?: NonNullable<Json>,"provider"?: string,"published"?: boolean,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"declaration_forms": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"description": string | null,"due_date": string | null,"fields": NonNullable<Json>,"id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"fields"?: NonNullable<Json>,"id"?: string,"title": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_date"?: string | null,"fields"?: NonNullable<Json>,"id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "declaration_forms_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"declaration_responses": {
                  Row: {
                    "employee_id": string,"form_id": string,"id": string,"responses": NonNullable<Json>,"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "employee_id": string,"form_id": string,"id"?: string,"responses"?: NonNullable<Json>,"submitted_at"?: string
                  }
                  Update: {
                    "employee_id"?: string,"form_id"?: string,"id"?: string,"responses"?: NonNullable<Json>,"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "declaration_responses_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "declaration_responses_form_id_fkey"
      columns: ["form_id"]
isOneToOne: false
      referencedRelation: "declaration_forms"
      referencedColumns: ["id"]
    }
                  ]
                },"departments": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"designations": {
                  Row: {
                    "created_at": string,"id": string,"level": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"level"?: number,"title": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"level"?: number,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"employee_education": {
                  Row: {
                    "created_at": string,"degree": string,"employee_id": string,"end_date": string | null,"grade": string | null,"id": string,"institution": string,"start_date": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"degree": string,"employee_id": string,"end_date"?: string | null,"grade"?: string | null,"id"?: string,"institution": string,"start_date"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"degree"?: string,"employee_id"?: string,"end_date"?: string | null,"grade"?: string | null,"id"?: string,"institution"?: string,"start_date"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_education_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_experience": {
                  Row: {
                    "company": string,"created_at": string,"description": string | null,"designation": string,"employee_id": string,"end_date": string | null,"id": string,"start_date": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company": string,"created_at"?: string,"description"?: string | null,"designation": string,"employee_id": string,"end_date"?: string | null,"id"?: string,"start_date"?: string | null
                  }
                  Update: {
                    "company"?: string,"created_at"?: string,"description"?: string | null,"designation"?: string,"employee_id"?: string,"end_date"?: string | null,"id"?: string,"start_date"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_experience_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_private": {
                  Row: {
                    "aadhaar_last4": string | null,"address": string | null,"bank_account": string | null,"bank_name": string | null,"emergency_contact_name": string | null,"emergency_contact_phone": string | null,"employee_id": string,"ifsc": string | null,"pan_number": string | null,"personal_email": string | null,"uan": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aadhaar_last4"?: string | null,"address"?: string | null,"bank_account"?: string | null,"bank_name"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"employee_id": string,"ifsc"?: string | null,"pan_number"?: string | null,"personal_email"?: string | null,"uan"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "aadhaar_last4"?: string | null,"address"?: string | null,"bank_account"?: string | null,"bank_name"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"employee_id"?: string,"ifsc"?: string | null,"pan_number"?: string | null,"personal_email"?: string | null,"uan"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_private_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: true
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"blood_group": string | null,"created_at": string,"date_of_birth": string | null,"date_of_joining": string,"department_id": string | null,"designation_id": string | null,"email": string,"employee_code": string,"employment_type": string,"first_name": string,"full_name": string | null,"gender": string | null,"id": string,"last_name": string,"location_id": string | null,"manager_id": string | null,"marital_status": string | null,"phone": string | null,"role": string,"status": string,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"blood_group"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"date_of_joining"?: string,"department_id"?: string | null,"designation_id"?: string | null,"email": string,"employee_code": string,"employment_type"?: string,"first_name": string,"full_name"?: never,"gender"?: string | null,"id"?: string,"last_name"?: string,"location_id"?: string | null,"manager_id"?: string | null,"marital_status"?: string | null,"phone"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"blood_group"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"date_of_joining"?: string,"department_id"?: string | null,"designation_id"?: string | null,"email"?: string,"employee_code"?: string,"employment_type"?: string,"first_name"?: string,"full_name"?: never,"gender"?: string | null,"id"?: string,"last_name"?: string,"location_id"?: string | null,"manager_id"?: string | null,"marital_status"?: string | null,"phone"?: string | null,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_designation_id_fkey"
      columns: ["designation_id"]
isOneToOne: false
      referencedRelation: "designations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_manager_id_fkey"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"exit_clearances": {
                  Row: {
                    "cleared_at": string | null,"cleared_by": string | null,"department": string,"id": string,"remarks": string | null,"resignation_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cleared_at"?: string | null,"cleared_by"?: string | null,"department": string,"id"?: string,"remarks"?: string | null,"resignation_id": string,"status"?: string
                  }
                  Update: {
                    "cleared_at"?: string | null,"cleared_by"?: string | null,"department"?: string,"id"?: string,"remarks"?: string | null,"resignation_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exit_clearances_cleared_by_fkey"
      columns: ["cleared_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "exit_clearances_resignation_id_fkey"
      columns: ["resignation_id"]
isOneToOne: false
      referencedRelation: "resignations"
      referencedColumns: ["id"]
    }
                  ]
                },"faqs": {
                  Row: {
                    "answer": string,"category": string,"created_at": string,"id": string,"question": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"category"?: string,"created_at"?: string,"id"?: string,"question": string,"sort_order"?: number
                  }
                  Update: {
                    "answer"?: string,"category"?: string,"created_at"?: string,"id"?: string,"question"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"favorites": {
                  Row: {
                    "created_at": string,"employee_id": string,"id": string,"module_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"employee_id": string,"id"?: string,"module_key": string
                  }
                  Update: {
                    "created_at"?: string,"employee_id"?: string,"id"?: string,"module_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"fbp_declarations": {
                  Row: {
                    "actioned_at": string | null,"approver_id": string | null,"approver_remarks": string | null,"components": NonNullable<Json>,"created_at": string,"employee_id": string,"financial_year": string,"id": string,"status": string,"submitted_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"components"?: NonNullable<Json>,"created_at"?: string,"employee_id": string,"financial_year": string,"id"?: string,"status"?: string,"submitted_at"?: string | null
                  }
                  Update: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"components"?: NonNullable<Json>,"created_at"?: string,"employee_id"?: string,"financial_year"?: string,"id"?: string,"status"?: string,"submitted_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fbp_declarations_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fbp_declarations_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"goal_updates": {
                  Row: {
                    "author_id": string,"comment": string,"created_at": string,"goal_id": string,"id": string,"progress": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"comment": string,"created_at"?: string,"goal_id": string,"id"?: string,"progress"?: number | null
                  }
                  Update: {
                    "author_id"?: string,"comment"?: string,"created_at"?: string,"goal_id"?: string,"id"?: string,"progress"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_updates_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goal_updates_goal_id_fkey"
      columns: ["goal_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "actioned_at": string | null,"approver_id": string | null,"approver_remarks": string | null,"category": string,"created_at": string,"created_by": string | null,"cycle_id": string | null,"description": string | null,"due_date": string | null,"employee_id": string | null,"id": string,"parent_goal_id": string | null,"progress": number,"status": string,"target": string | null,"title": string,"updated_at": string,"weightage": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"category"?: string,"created_at"?: string,"created_by"?: string | null,"cycle_id"?: string | null,"description"?: string | null,"due_date"?: string | null,"employee_id"?: string | null,"id"?: string,"parent_goal_id"?: string | null,"progress"?: number,"status"?: string,"target"?: string | null,"title": string,"updated_at"?: string,"weightage"?: number
                  }
                  Update: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"category"?: string,"created_at"?: string,"created_by"?: string | null,"cycle_id"?: string | null,"description"?: string | null,"due_date"?: string | null,"employee_id"?: string | null,"id"?: string,"parent_goal_id"?: string | null,"progress"?: number,"status"?: string,"target"?: string | null,"title"?: string,"updated_at"?: string,"weightage"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "review_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_parent_goal_id_fkey"
      columns: ["parent_goal_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    }
                  ]
                },"helpdesk_tickets": {
                  Row: {
                    "assigned_to": string | null,"category": string,"created_at": string,"description": string,"employee_id": string,"id": string,"priority": string,"resolved_at": string | null,"seq": number,"status": string,"subject": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"category": string,"created_at"?: string,"description": string,"employee_id": string,"id"?: string,"priority"?: string,"resolved_at"?: string | null,"seq"?: never,"status"?: string,"subject": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"category"?: string,"created_at"?: string,"description"?: string,"employee_id"?: string,"id"?: string,"priority"?: string,"resolved_at"?: string | null,"seq"?: never,"status"?: string,"subject"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "helpdesk_tickets_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "helpdesk_tickets_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"holidays": {
                  Row: {
                    "date": string,"id": string,"location_id": string | null,"name": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "date": string,"id"?: string,"location_id"?: string | null,"name": string,"type"?: string
                  }
                  Update: {
                    "date"?: string,"id"?: string,"location_id"?: string | null,"name"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "holidays_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"interviews": {
                  Row: {
                    "candidate_id": string,"created_at": string,"feedback": string | null,"id": string,"interviewer_id": string,"mode": string,"rating": number | null,"result": string,"round_name": string,"scheduled_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id": string,"created_at"?: string,"feedback"?: string | null,"id"?: string,"interviewer_id": string,"mode"?: string,"rating"?: number | null,"result"?: string,"round_name"?: string,"scheduled_at": string
                  }
                  Update: {
                    "candidate_id"?: string,"created_at"?: string,"feedback"?: string | null,"id"?: string,"interviewer_id"?: string,"mode"?: string,"rating"?: number | null,"result"?: string,"round_name"?: string,"scheduled_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interviews_candidate_id_fkey"
      columns: ["candidate_id"]
isOneToOne: false
      referencedRelation: "candidates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interviews_interviewer_id_fkey"
      columns: ["interviewer_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"investment_declarations": {
                  Row: {
                    "actioned_at": string | null,"approver_id": string | null,"approver_remarks": string | null,"created_at": string,"employee_id": string,"financial_year": string,"id": string,"items": NonNullable<Json>,"regime": string,"status": string,"submitted_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"employee_id": string,"financial_year": string,"id"?: string,"items"?: NonNullable<Json>,"regime"?: string,"status"?: string,"submitted_at"?: string | null
                  }
                  Update: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"employee_id"?: string,"financial_year"?: string,"id"?: string,"items"?: NonNullable<Json>,"regime"?: string,"status"?: string,"submitted_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "investment_declarations_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "investment_declarations_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"job_openings": {
                  Row: {
                    "created_at": string,"created_by": string | null,"department_id": string | null,"description": string,"employment_type": string,"experience_max": number,"experience_min": number,"hiring_manager_id": string | null,"id": string,"location_id": string | null,"openings": number,"referral_bonus": number,"requirements": string | null,"status": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"description": string,"employment_type"?: string,"experience_max"?: number,"experience_min"?: number,"hiring_manager_id"?: string | null,"id"?: string,"location_id"?: string | null,"openings"?: number,"referral_bonus"?: number,"requirements"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"department_id"?: string | null,"description"?: string,"employment_type"?: string,"experience_max"?: number,"experience_min"?: number,"hiring_manager_id"?: string | null,"id"?: string,"location_id"?: string | null,"openings"?: number,"referral_bonus"?: number,"requirements"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_openings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_openings_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_openings_hiring_manager_id_fkey"
      columns: ["hiring_manager_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_openings_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_balances": {
                  Row: {
                    "allocated": number,"employee_id": string,"id": string,"leave_type_id": string,"used": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allocated"?: number,"employee_id": string,"id"?: string,"leave_type_id": string,"used"?: number,"year": number
                  }
                  Update: {
                    "allocated"?: number,"employee_id"?: string,"id"?: string,"leave_type_id"?: string,"used"?: number,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_balances_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_balances_leave_type_id_fkey"
      columns: ["leave_type_id"]
isOneToOne: false
      referencedRelation: "leave_types"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_requests": {
                  Row: {
                    "actioned_at": string | null,"approver_id": string | null,"approver_remarks": string | null,"created_at": string,"days": number,"employee_id": string,"end_date": string,"half_day": boolean,"half_day_session": string | null,"id": string,"leave_type_id": string,"reason": string,"start_date": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"days": number,"employee_id": string,"end_date": string,"half_day"?: boolean,"half_day_session"?: string | null,"id"?: string,"leave_type_id": string,"reason": string,"start_date": string,"status"?: string
                  }
                  Update: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"days"?: number,"employee_id"?: string,"end_date"?: string,"half_day"?: boolean,"half_day_session"?: string | null,"id"?: string,"leave_type_id"?: string,"reason"?: string,"start_date"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_leave_type_id_fkey"
      columns: ["leave_type_id"]
isOneToOne: false
      referencedRelation: "leave_types"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_types": {
                  Row: {
                    "active": boolean,"allow_half_day": boolean,"annual_quota": number,"carry_forward": boolean,"code": string,"color": string,"id": string,"is_paid": boolean,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"allow_half_day"?: boolean,"annual_quota"?: number,"carry_forward"?: boolean,"code": string,"color"?: string,"id"?: string,"is_paid"?: boolean,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "active"?: boolean,"allow_half_day"?: boolean,"annual_quota"?: number,"carry_forward"?: boolean,"code"?: string,"color"?: string,"id"?: string,"is_paid"?: boolean,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"letter_requests": {
                  Row: {
                    "actioned_at": string | null,"approver_id": string | null,"approver_remarks": string | null,"created_at": string,"employee_id": string,"id": string,"letter_id": string | null,"letter_type": string,"purpose": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"employee_id": string,"id"?: string,"letter_id"?: string | null,"letter_type": string,"purpose"?: string | null,"status"?: string
                  }
                  Update: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"employee_id"?: string,"id"?: string,"letter_id"?: string | null,"letter_type"?: string,"purpose"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "letter_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "letter_requests_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "letter_requests_letter_id_fkey"
      columns: ["letter_id"]
isOneToOne: false
      referencedRelation: "letters"
      referencedColumns: ["id"]
    }
                  ]
                },"letters": {
                  Row: {
                    "category": string,"content": string,"created_at": string,"employee_id": string,"id": string,"issued_by": string | null,"issued_on": string,"letter_type": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"content": string,"created_at"?: string,"employee_id": string,"id"?: string,"issued_by"?: string | null,"issued_on"?: string,"letter_type": string,"title": string
                  }
                  Update: {
                    "category"?: string,"content"?: string,"created_at"?: string,"employee_id"?: string,"id"?: string,"issued_by"?: string | null,"issued_on"?: string,"letter_type"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "letters_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "letters_issued_by_fkey"
      columns: ["issued_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "city": string | null,"country": string,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city"?: string | null,"country"?: string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "city"?: string | null,"country"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"employee_id": string,"id": string,"link": string | null,"read_at": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"employee_id": string,"id"?: string,"link"?: string | null,"read_at"?: string | null,"title": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"employee_id"?: string,"id"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"org_settings": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"payslips": {
                  Row: {
                    "created_at": string,"deductions": NonNullable<Json>,"earnings": NonNullable<Json>,"employee_id": string,"gross": number,"id": string,"lop_days": number,"month": number,"net_pay": number,"paid_days": number,"published_at": string | null,"status": string,"total_deductions": number,"working_days": number,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deductions"?: NonNullable<Json>,"earnings"?: NonNullable<Json>,"employee_id": string,"gross": number,"id"?: string,"lop_days"?: number,"month": number,"net_pay": number,"paid_days"?: number,"published_at"?: string | null,"status"?: string,"total_deductions": number,"working_days"?: number,"year": number
                  }
                  Update: {
                    "created_at"?: string,"deductions"?: NonNullable<Json>,"earnings"?: NonNullable<Json>,"employee_id"?: string,"gross"?: number,"id"?: string,"lop_days"?: number,"month"?: number,"net_pay"?: number,"paid_days"?: number,"published_at"?: string | null,"status"?: string,"total_deductions"?: number,"working_days"?: number,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "payslips_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"policies": {
                  Row: {
                    "category": string,"content": string,"created_at": string,"effective_date": string,"id": string,"published": boolean,"requires_acknowledgement": boolean,"summary": string | null,"title": string,"updated_at": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"content": string,"created_at"?: string,"effective_date"?: string,"id"?: string,"published"?: boolean,"requires_acknowledgement"?: boolean,"summary"?: string | null,"title": string,"updated_at"?: string,"version"?: string
                  }
                  Update: {
                    "category"?: string,"content"?: string,"created_at"?: string,"effective_date"?: string,"id"?: string,"published"?: boolean,"requires_acknowledgement"?: boolean,"summary"?: string | null,"title"?: string,"updated_at"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"policy_acknowledgements": {
                  Row: {
                    "acknowledged_at": string,"employee_id": string,"policy_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string,"employee_id": string,"policy_id": string
                  }
                  Update: {
                    "acknowledged_at"?: string,"employee_id"?: string,"policy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_acknowledgements_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_acknowledgements_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policies"
      referencedColumns: ["id"]
    }
                  ]
                },"regularization_requests": {
                  Row: {
                    "actioned_at": string | null,"approver_id": string | null,"approver_remarks": string | null,"check_in": string,"check_out": string,"created_at": string,"date": string,"employee_id": string,"id": string,"reason": string,"request_type": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"check_in": string,"check_out": string,"created_at"?: string,"date": string,"employee_id": string,"id"?: string,"reason": string,"request_type"?: string,"status"?: string
                  }
                  Update: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"check_in"?: string,"check_out"?: string,"created_at"?: string,"date"?: string,"employee_id"?: string,"id"?: string,"reason"?: string,"request_type"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regularization_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "regularization_requests_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"remote_work_sessions": {
                  Row: {
                    "check_in_accuracy": number | null,"check_in_at": string,"check_in_device": string | null,"check_in_ip": string | null,"check_in_lat": number | null,"check_in_lng": number | null,"check_in_photo": string,"check_out_accuracy": number | null,"check_out_at": string | null,"check_out_device": string | null,"check_out_ip": string | null,"check_out_lat": number | null,"check_out_lng": number | null,"check_out_photo": string | null,"created_at": string,"employee_id": string,"id": string,"notes": string | null,"work_date": string,"worked_minutes": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "check_in_accuracy"?: number | null,"check_in_at"?: string,"check_in_device"?: string | null,"check_in_ip"?: string | null,"check_in_lat"?: number | null,"check_in_lng"?: number | null,"check_in_photo": string,"check_out_accuracy"?: number | null,"check_out_at"?: string | null,"check_out_device"?: string | null,"check_out_ip"?: string | null,"check_out_lat"?: number | null,"check_out_lng"?: number | null,"check_out_photo"?: string | null,"created_at"?: string,"employee_id": string,"id"?: string,"notes"?: string | null,"work_date"?: string,"worked_minutes"?: never
                  }
                  Update: {
                    "check_in_accuracy"?: number | null,"check_in_at"?: string,"check_in_device"?: string | null,"check_in_ip"?: string | null,"check_in_lat"?: number | null,"check_in_lng"?: number | null,"check_in_photo"?: string,"check_out_accuracy"?: number | null,"check_out_at"?: string | null,"check_out_device"?: string | null,"check_out_ip"?: string | null,"check_out_lat"?: number | null,"check_out_lng"?: number | null,"check_out_photo"?: string | null,"created_at"?: string,"employee_id"?: string,"id"?: string,"notes"?: string | null,"work_date"?: string,"worked_minutes"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "remote_work_sessions_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"resignations": {
                  Row: {
                    "approved_last_day": string | null,"created_at": string,"employee_id": string,"hr_action_at": string | null,"hr_remarks": string | null,"id": string,"manager_action_at": string | null,"manager_remarks": string | null,"notice_period_days": number,"reason": string,"reason_category": string,"requested_last_day": string,"resignation_date": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_last_day"?: string | null,"created_at"?: string,"employee_id": string,"hr_action_at"?: string | null,"hr_remarks"?: string | null,"id"?: string,"manager_action_at"?: string | null,"manager_remarks"?: string | null,"notice_period_days"?: number,"reason": string,"reason_category": string,"requested_last_day": string,"resignation_date"?: string,"status"?: string
                  }
                  Update: {
                    "approved_last_day"?: string | null,"created_at"?: string,"employee_id"?: string,"hr_action_at"?: string | null,"hr_remarks"?: string | null,"id"?: string,"manager_action_at"?: string | null,"manager_remarks"?: string | null,"notice_period_days"?: number,"reason"?: string,"reason_category"?: string,"requested_last_day"?: string,"resignation_date"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resignations_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"review_cycles": {
                  Row: {
                    "created_at": string,"end_date": string,"id": string,"name": string,"start_date": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_date": string,"id"?: string,"name": string,"start_date": string,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"end_date"?: string,"id"?: string,"name"?: string,"start_date"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reviews": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"cycle_id": string,"employee_id": string,"final_rating": number | null,"id": string,"manager_comments": string | null,"manager_rating": number | null,"reviewer_id": string | null,"self_comments": string | null,"self_improvements": string | null,"self_rating": number | null,"self_strengths": string | null,"self_submitted_at": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"cycle_id": string,"employee_id": string,"final_rating"?: number | null,"id"?: string,"manager_comments"?: string | null,"manager_rating"?: number | null,"reviewer_id"?: string | null,"self_comments"?: string | null,"self_improvements"?: string | null,"self_rating"?: number | null,"self_strengths"?: string | null,"self_submitted_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"cycle_id"?: string,"employee_id"?: string,"final_rating"?: number | null,"id"?: string,"manager_comments"?: string | null,"manager_rating"?: number | null,"reviewer_id"?: string | null,"self_comments"?: string | null,"self_improvements"?: string | null,"self_rating"?: number | null,"self_strengths"?: string | null,"self_submitted_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_cycle_id_fkey"
      columns: ["cycle_id"]
isOneToOne: false
      referencedRelation: "review_cycles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"salary_structures": {
                  Row: {
                    "annual_ctc": number,"basic": number,"created_at": string,"effective_from": string,"employee_id": string,"fbp_total": number,"gratuity": number,"hra": number,"id": string,"is_current": boolean,"pf_employer": number,"special_allowance": number,"variable_pay": number
                  }
                  ComputedFields: never
                  Insert: {
                    "annual_ctc": number,"basic": number,"created_at"?: string,"effective_from": string,"employee_id": string,"fbp_total"?: number,"gratuity"?: number,"hra": number,"id"?: string,"is_current"?: boolean,"pf_employer"?: number,"special_allowance": number,"variable_pay"?: number
                  }
                  Update: {
                    "annual_ctc"?: number,"basic"?: number,"created_at"?: string,"effective_from"?: string,"employee_id"?: string,"fbp_total"?: number,"gratuity"?: number,"hra"?: number,"id"?: string,"is_current"?: boolean,"pf_employer"?: number,"special_allowance"?: number,"variable_pay"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "salary_structures_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"id"?: string,"ticket_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ticket_comments_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "helpdesk_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"vpf_declarations": {
                  Row: {
                    "actioned_at": string | null,"approver_id": string | null,"approver_remarks": string | null,"created_at": string,"effective_month": string,"employee_id": string,"financial_year": string,"id": string,"percentage": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"effective_month": string,"employee_id": string,"financial_year": string,"id"?: string,"percentage": number,"status"?: string
                  }
                  Update: {
                    "actioned_at"?: string | null,"approver_id"?: string | null,"approver_remarks"?: string | null,"created_at"?: string,"effective_month"?: string,"employee_id"?: string,"financial_year"?: string,"id"?: string,"percentage"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vpf_declarations_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vpf_declarations_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "auth_employee_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"auth_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"can_approve_for":
{ Args: { "emp": string }; Returns: boolean
                           },
"candidate_exists":
{ Args: { "p_email": string,"p_job": string }; Returns: boolean
                           },
"is_above_me":
{ Args: { "emp": string }; Returns: boolean
                           },
"is_hr":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_interviewer_for":
{ Args: { "cand": string }; Returns: boolean
                           },
"is_manager_of":
{ Args: { "emp": string }; Returns: boolean
                           },
"notify":
{ Args: { "emp": string,"p_body": string,"p_link": string,"p_title": string }; Returns: undefined
                           },
"org_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
