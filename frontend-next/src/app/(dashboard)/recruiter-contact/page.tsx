"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Star,
  Clock,
  Shield,
  Sparkles,
  Phone,
  Mail,
  Calendar,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { huntzenApi } from "@/lib/api/huntzen-client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptionalAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import { HeroSection } from "@/components/recruiter/hero-section";
import { ProcessSteps } from "@/components/recruiter/process-steps";
import { TestimonialsSection } from "@/components/recruiter/testimonials-section";
import { FAQSection } from "@/components/recruiter/faq-section";
import { PageGate } from "@/components/auth/page-gate";

export default function RecruiterContactPage() {
  const t = useTranslations("dashboard.recruiterContact");
  const router = useRouter();
  const auth = useOptionalAuth();
  const user = auth?.user;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: user?.user_metadata?.full_name || "",
    email: user?.email || "",
    phone: "",
    sector: "",
    experienceLevel: "",
    message: "",
    preferredDate: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validation functions
  const validateField = (field: string, value: string): string => {
    switch (field) {
      case "fullName":
        if (!value.trim()) return t("validation.fullNameRequired");
        if (value.trim().length < 2) return t("validation.fullNameTooShort");
        return "";
      case "email":
        if (!value.trim()) return t("validation.emailRequired");
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return t("validation.emailInvalid");
        return "";
      case "phone":
        if (value && !/^[\d\s+()-]+$/.test(value))
          return t("validation.phoneInvalid");
        return "";
      case "sector":
        if (!value) return t("validation.sectorRequired");
        return "";
      case "experienceLevel":
        if (!value) return t("validation.experienceRequired");
        return "";
      case "message":
        if (!value.trim()) return t("validation.messageRequired");
        if (value.trim().length < 10) return t("validation.messageTooShort");
        return "";
      default:
        return "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push(
        "/login?redirectTo=" + encodeURIComponent("/recruiter-contact"),
      );
      return;
    }

    // Validate all fields before submit
    const newErrors: Record<string, string> = {};
    Object.keys(formData).forEach((field) => {
      const error = validateField(
        field,
        formData[field as keyof typeof formData],
      );
      if (error) newErrors[field] = error;
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setTouched(
        Object.keys(formData).reduce(
          (acc, key) => ({ ...acc, [key]: true }),
          {},
        ),
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Create recruiter request
      const response = await huntzenApi.createRecruiterRequest(formData);

      // Create Stripe payment session
      const paymentResponse = await huntzenApi.createRecruiterPayment(
        response.request_id,
      );

      // Redirect to Stripe checkout
      if (paymentResponse.checkout_url) {
        window.location.href = paymentResponse.checkout_url;
      }
    } catch (error: unknown) {
      toast.error(t("form.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(
      field,
      formData[field as keyof typeof formData],
    );
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  return (
    <PageGate featureFlag="page_recruiter_contact">
      <div className="container max-w-6xl mx-auto px-4 py-8">
        {/* Hero Premium */}
        <HeroSection />

        {/* Stats rapides */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center p-6 bg-white rounded-xl border-2 border-[#00D9FF]/20 hover:border-[#00D9FF] hover:shadow-lg transition-all"
          >
            <div className="text-4xl font-black text-[#00D9FF] mb-2">127</div>
            <p className="text-sm text-gray-600">{t("stats.consultations")}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center p-6 bg-white rounded-xl border-2 border-[#00C4EA]/20 hover:border-[#00C4EA] hover:shadow-lg transition-all"
          >
            <div className="text-4xl font-black text-[#00C4EA] mb-2">4.9/5</div>
            <p className="text-sm text-gray-600">{t("stats.satisfaction")}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center p-6 bg-white rounded-xl border-2 border-[#00D9FF]/20 hover:border-[#00D9FF] hover:shadow-lg transition-all"
          >
            <div className="text-4xl font-black text-[#00D9FF] mb-2">48h</div>
            <p className="text-sm text-gray-600">{t("stats.delay")}</p>
          </motion.div>
        </motion.div>

        {/* Benefits Section */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: CheckCircle2,
              title: t("benefits.personalizedTitle"),
              description: t("benefits.personalizedDesc"),
              delay: 0.7,
            },
            {
              icon: Star,
              title: t("benefits.expertiseTitle"),
              description: t("benefits.expertiseDesc"),
              delay: 0.8,
            },
            {
              icon: Clock,
              title: t("benefits.fastResponseTitle"),
              description: t("benefits.fastResponseDesc"),
              delay: 0.9,
            },
          ].map((benefit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: benefit.delay }}
            >
              <Card className="border-2 border-gray-200 hover:border-[#00D9FF] hover:shadow-lg transition-all h-full">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] flex items-center justify-center mb-4 shadow-lg shadow-[#00D9FF]/30">
                    <benefit.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-lg text-black mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-gray-600 text-sm">{benefit.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Process Steps */}
        <ProcessSteps />

        {/* Testimonials */}
        <TestimonialsSection />

        <motion.div
          id="contact-form"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="grid lg:grid-cols-2 gap-8"
        >
          {/* Pricing Card */}
          <Card className="border-2 border-[#00D9FF] shadow-lg overflow-hidden h-fit">
            <CardHeader className="bg-gradient-to-br from-[#00D9FF] to-[#00C4EA] text-white">
              <CardTitle className="text-2xl flex items-center gap-2">
                <Sparkles className="w-6 h-6" />
                {t("pricing.title")}
              </CardTitle>
              <CardDescription className="text-white/90 text-lg">
                {t("pricing.sessionDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-5xl font-bold text-black">50€</span>
                  <span className="text-gray-600">
                    {t("pricing.perConsultation")}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {t("pricing.noSubscription")}
                </p>
              </div>

              <div className="space-y-4">
                {[
                  {
                    title: t("pricing.item1Title"),
                    description: t("pricing.item1Desc"),
                  },
                  {
                    title: t("pricing.item2Title"),
                    description: t("pricing.item2Desc"),
                  },
                  {
                    title: t("pricing.item3Title"),
                    description: t("pricing.item3Desc"),
                  },
                  {
                    title: t("pricing.item4Title"),
                    description: t("pricing.item4Desc"),
                  },
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.1 + index * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-[#00D9FF] mt-0.5" />
                    <div>
                      <p className="font-medium text-black">{item.title}</p>
                      <p className="text-sm text-gray-600">
                        {item.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Shield className="w-4 h-4" />
                  <span>{t("pricing.securePay")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Request Form */}
          <Card className="border-2 border-gray-200 h-fit">
            <CardHeader>
              <CardTitle className="text-black">{t("form.title")}</CardTitle>
              <CardDescription>{t("form.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="fullName">{t("form.fullName")}</Label>
                    <Input
                      id="fullName"
                      placeholder={t("form.fullNamePlaceholder")}
                      value={formData.fullName}
                      onChange={(e) => handleChange("fullName", e.target.value)}
                      onBlur={() => handleBlur("fullName")}
                      required
                      className={`border-slate-300 focus:border-[#00D9FF] focus:ring-[#00D9FF] ${touched.fullName && errors.fullName ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                      aria-invalid={touched.fullName && !!errors.fullName}
                    />
                    {touched.fullName && errors.fullName && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="email">{t("form.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder={t("form.emailPlaceholder")}
                        className={`pl-10 border-slate-300 focus:border-[#00D9FF] focus:ring-[#00D9FF] ${touched.email && errors.email ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                        value={formData.email}
                        onChange={(e) => handleChange("email", e.target.value)}
                        onBlur={() => handleBlur("email")}
                        required
                        aria-invalid={touched.email && !!errors.email}
                      />
                    </div>
                    {touched.email && errors.email && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="phone">{t("form.phone")}</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder={t("form.phonePlaceholder")}
                        className={`pl-10 border-slate-300 focus:border-[#00D9FF] focus:ring-[#00D9FF] ${touched.phone && errors.phone ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                        value={formData.phone}
                        onChange={(e) => handleChange("phone", e.target.value)}
                        onBlur={() => handleBlur("phone")}
                        aria-invalid={touched.phone && !!errors.phone}
                      />
                    </div>
                    {touched.phone && errors.phone && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.phone}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="sector">{t("form.sector")}</Label>
                    <Select
                      value={formData.sector}
                      onValueChange={(value) => {
                        handleChange("sector", value);
                        handleBlur("sector");
                      }}
                      required
                    >
                      <SelectTrigger
                        id="sector"
                        className={`${touched.sector && errors.sector ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                        aria-invalid={touched.sector && !!errors.sector}
                      >
                        <SelectValue
                          placeholder={t("form.sectorPlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tech">
                          {t("form.sectors.tech")}
                        </SelectItem>
                        <SelectItem value="finance">
                          {t("form.sectors.finance")}
                        </SelectItem>
                        <SelectItem value="marketing">
                          {t("form.sectors.marketing")}
                        </SelectItem>
                        <SelectItem value="sales">
                          {t("form.sectors.sales")}
                        </SelectItem>
                        <SelectItem value="hr">
                          {t("form.sectors.hr")}
                        </SelectItem>
                        <SelectItem value="engineering">
                          {t("form.sectors.engineering")}
                        </SelectItem>
                        <SelectItem value="healthcare">
                          {t("form.sectors.healthcare")}
                        </SelectItem>
                        <SelectItem value="education">
                          {t("form.sectors.education")}
                        </SelectItem>
                        <SelectItem value="other">
                          {t("form.sectors.other")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {touched.sector && errors.sector && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.sector}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="experienceLevel">
                      {t("form.experienceLevel")}
                    </Label>
                    <Select
                      value={formData.experienceLevel}
                      onValueChange={(value) => {
                        handleChange("experienceLevel", value);
                        handleBlur("experienceLevel");
                      }}
                      required
                    >
                      <SelectTrigger
                        id="experienceLevel"
                        className={`${touched.experienceLevel && errors.experienceLevel ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                        aria-invalid={
                          touched.experienceLevel && !!errors.experienceLevel
                        }
                      >
                        <SelectValue
                          placeholder={t("form.experiencePlaceholder")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="junior">
                          {t("form.levels.junior")}
                        </SelectItem>
                        <SelectItem value="confirmed">
                          {t("form.levels.confirmed")}
                        </SelectItem>
                        <SelectItem value="senior">
                          {t("form.levels.senior")}
                        </SelectItem>
                        <SelectItem value="expert">
                          {t("form.levels.expert")}
                        </SelectItem>
                        <SelectItem value="manager">
                          {t("form.levels.manager")}
                        </SelectItem>
                        <SelectItem value="executive">
                          {t("form.levels.executive")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {touched.experienceLevel && errors.experienceLevel && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.experienceLevel}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="preferredDate">
                      {t("form.preferredDate")}
                    </Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <Input
                        id="preferredDate"
                        type="date"
                        className="pl-10 border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
                        value={formData.preferredDate}
                        onChange={(e) =>
                          handleChange("preferredDate", e.target.value)
                        }
                        min={new Date().toISOString().split("T")[0]}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message">{t("form.message")}</Label>
                    <Textarea
                      id="message"
                      placeholder={t("form.messagePlaceholder")}
                      rows={4}
                      value={formData.message}
                      onChange={(e) => handleChange("message", e.target.value)}
                      onBlur={() => handleBlur("message")}
                      required
                      className={`border-slate-300 focus:border-[#00D9FF] focus:ring-[#00D9FF] ${touched.message && errors.message ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                      aria-invalid={touched.message && !!errors.message}
                    />
                    {touched.message && errors.message && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.message}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] hover:shadow-lg hover:shadow-[#00D9FF]/40 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  disabled={
                    isSubmitting || !formData.fullName || !formData.email
                  }
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t("form.submitting")}</span>
                    </div>
                  ) : (
                    <>
                      {t("form.submit")}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  {t("form.submitNote")}
                </p>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* FAQ Interactive */}
        <FAQSection />

        {/* CTA Bottom */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] text-white p-12 rounded-3xl text-center mt-12 shadow-xl"
        >
          <h3 className="text-3xl font-bold mb-4">{t("cta.title")}</h3>
          <p className="text-xl text-white/90 mb-6">{t("cta.spots")}</p>
          <Button
            size="lg"
            className="h-14 px-12 bg-white text-[#00D9FF] hover:bg-gray-100 font-bold transition-all duration-300 hover:scale-105"
            onClick={() => {
              const formSection = document.getElementById("contact-form");
              formSection?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
          >
            {t("cta.button")}
          </Button>
        </motion.div>
      </div>
    </PageGate>
  );
}
