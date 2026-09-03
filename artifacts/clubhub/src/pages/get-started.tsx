import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCompleteOnboarding } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NahreoBrand } from "@/components/brand/nahreo-logo";
import { ArrowLeft, ArrowRight, Loader2, Check } from "lucide-react";

const formSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  clubName: z.string().min(1, "Club name is required").max(160),
  countryCode: z.enum(["AU", "NZ", "GB", "US", "CA"], {
    required_error: "Please select a country",
  }),
  teamName: z.string().min(1, "Team name is required").max(160),
  ageGroup: z.string().min(1, "Age group is required").max(80),
  gender: z.string().max(80).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

export default function GetStarted() {
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isReady, setIsReady] = useState(false);

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => {
    setIsReady(true);
  }, []);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      clubName: "",
      countryCode: "AU",
      teamName: "",
      ageGroup: "",
      gender: "",
    },
  });

  const completeOnboarding = useCompleteOnboarding();

  const nextStep = async () => {
    let fieldsToValidate: any[] = [];
    if (step === 0) fieldsToValidate = ["firstName", "lastName"];
    if (step === 1) fieldsToValidate = ["clubName", "countryCode"];
    
    const isValid = await form.trigger(fieldsToValidate as any);
    if (isValid) setStep((s) => s + 1);
  };

  const prevStep = () => {
    setStep((s) => s - 1);
  };

  const onSubmit = (data: FormValues) => {
    completeOnboarding.mutate({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        clubName: data.clubName,
        countryCode: data.countryCode,
        teamName: data.teamName,
        ageGroup: data.ageGroup,
        gender: data.gender || undefined,
      }
    }, {
      onSuccess: () => {
        // Clear all queries to force refetching fresh user/club/team data
        queryClient.clear();
        
        toast({
          title: "Welcome to Nahreo",
          description: "Your club is ready to go.",
        });
        setLocation("/home");
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "Something went wrong",
          description: "Please try again or contact support if the problem persists.",
        });
      }
    });
  };

  if (!isReady) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-gray-50 selection:bg-primary/10 selection:text-primary">
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
        <NahreoBrand />
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col gap-2">
            <h1 className="text-3xl font-display font-bold tracking-tight">
              {step === 0 && "Welcome to Nahreo"}
              {step === 1 && "Create your club"}
              {step === 2 && "Add your first team"}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {step === 0 && "Let's start by getting your name for the administrator account."}
              {step === 1 && "What's the name of your organization?"}
              {step === 2 && "You can add more teams and age groups later."}
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-6 md:p-8 shadow-sm">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col">
                <div className="min-h-[220px]">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                      {step === 0 && (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Jane" {...field} autoFocus />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Smith" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {step === 1 && (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="clubName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Club or organization name</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g. Westside Athletics" {...field} autoFocus />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="countryCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Country</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a country" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="AU">Australia</SelectItem>
                                    <SelectItem value="CA">Canada</SelectItem>
                                    <SelectItem value="NZ">New Zealand</SelectItem>
                                    <SelectItem value="GB">United Kingdom</SelectItem>
                                    <SelectItem value="US">United States</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {step === 2 && (
                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="teamName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Team name</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g. Eagles" {...field} autoFocus />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="ageGroup"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Age group</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. U14" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="gender"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Gender <span className="text-gray-400 font-normal ml-1">Optional</span></FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. Boys" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="pt-8 flex items-center justify-between gap-4 mt-auto">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={prevStep} 
                    disabled={step === 0 || completeOnboarding.isPending}
                    className={step === 0 ? "invisible" : ""}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  
                  {step < 2 ? (
                    <Button type="button" onClick={nextStep} className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-sm hover-elevate">
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button 
                      type="submit" 
                      disabled={completeOnboarding.isPending}
                      className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-sm hover-elevate"
                    >
                      {completeOnboarding.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Setting up...
                        </>
                      ) : (
                        <>
                          Complete setup
                          <Check className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </div>

          <div className="mt-8 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div 
                key={i} 
                className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
                  i <= step ? "bg-primary" : "bg-gray-200 dark:bg-zinc-800"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
