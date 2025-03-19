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
