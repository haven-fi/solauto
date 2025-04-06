#[macro_export]
macro_rules! check {
    ($cond:expr, $err:expr) => {
        if !($cond) {
            let error_code = $err;
            solana_program::msg!(
                "Error \"{}\" thrown at {}:{}",
                error_code,
                file!(),
                line!()
            );
            return Err(error_code.into());
        }
    };

    (
        $cond:expr,
        $err:expr,
        $($arg:tt)*
    ) => {
        if !($cond) {
            let error_code = $err;
            solana_program::msg!(
                "Error \"{}\" thrown at {}:{}",
                error_code,
                file!(),
                line!()
            );
            solana_program::msg!($($arg)*);
            return Err(error_code.into());
        }
    };
}

#[macro_export]
macro_rules! error_if {
    ($cond:expr, $err:expr) => {
        if ($cond) {
            let error_code = $err;
            solana_program::msg!("Error \"{}\" thrown at {}:{}", error_code, file!(), line!());
            return Err(error_code.into());
        }
    };
}

#[macro_export]
macro_rules! derive_pod_traits {
    ($type:ty) => {
        unsafe impl Zeroable for $type {}
        unsafe impl Pod for $type {}
    };
}
